/**
 * yuta-eng からの保険用 Webhook 受け口(サーバー間)。
 *   POST /api/provision
 *   ヘッダ: x-nobit-secret: <共有シークレット>, Content-Type: application/json
 *   ボディ: 照会APIと同じJSON形
 *
 * 仕様:
 *   1. x-nobit-secret を NOBIT_REGISTER_SECRET と照合(不一致は 401)
 *   2. paid !== true なら何もせず 200(ログのみ)
 *   3. 冪等に仮アカウントを upsert(既に本登録済みなら何もしない)
 *   4. ログイン情報メール・運営通知を冪等送信
 *   5. 成功時は 200。発行または顧客メール送信に失敗した場合は、再試行のため 5xx。
 */
import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { isPaid, maskEmail, provisionAccount, provisionPayloadSchema } from "@/lib/provision";
import { sendProvisionEmails } from "@/lib/provision-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretOk(provided: string | null): boolean {
  const expected = process.env.NOBIT_REGISTER_SECRET ?? "";
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function baseUrl(req: Request): string {
  return (process.env.AUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}

/**
 * 設定確認(診断)用。値そのものは返さず「設定済みか/組織がDBに存在するか/
 * yuta-eng に到達&シークレット一致するか」だけを返す。
 *   GET /api/provision            ヘッダ x-nobit-secret 必須(=シークレット一致の確認も兼ねる)
 *   GET /api/provision?upstream=1 yuta-eng 照会APIへの到達&シークレット一致も実測
 */
export async function GET(req: Request) {
  // ここを 200 で通過できること自体が NOBIT_REGISTER_SECRET の一致を意味する。
  if (!secretOk(req.headers.get("x-nobit-secret"))) {
    return Response.json(
      { ok: false, error: "unauthorized", hint: "x-nobit-secret が未設定/不一致です" },
      { status: 401 },
    );
  }

  // NOBIT_PROVISION_ORG_ID: 設定有無 + DBに該当組織が存在するか(名前のみ・非機密)
  const orgId = process.env.NOBIT_PROVISION_ORG_ID ?? "";
  let org: { set: boolean; existsInDb?: boolean; name?: string } = { set: !!orgId };
  if (orgId) {
    try {
      const [o] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      org = { set: true, existsInDb: !!o, name: o?.name };
    } catch {
      org = { set: true, existsInDb: false };
    }
  }

  const result: Record<string, unknown> = {
    ok: true,
    env: {
      NOBIT_REGISTER_SECRET: "set & matched", // ここに来た時点で一致
      NOBIT_PROVISION_ORG_ID: org,
      YUTA_ENG_BASE_URL: process.env.YUTA_ENG_BASE_URL ?? "(未設定→既定 https://yuta-eng.com)",
      AUTH_URL: process.env.AUTH_URL ?? "(未設定→リクエスト origin を使用)",
      RESEND_API_KEY: { set: !!process.env.RESEND_API_KEY },
      SETUP_EMAIL_FROM: process.env.SETUP_EMAIL_FROM ?? "(未設定→既定 onboarding@resend.dev)",
    },
  };

  // 任意: yuta-eng 照会APIへの到達 & シークレット一致を実測(ダミー session_id)。
  if (new URL(req.url).searchParams.get("upstream")) {
    const base = (process.env.YUTA_ENG_BASE_URL ?? "https://yuta-eng.com").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/api/provision/session?session_id=__healthcheck__`, {
        headers: { "x-nobit-secret": process.env.NOBIT_REGISTER_SECRET ?? "" },
        cache: "no-store",
      });
      result.upstream = {
        reachable: true,
        status: r.status,
        secretAcceptedByYutaEng: r.status !== 401, // 401 ならこちらの秘密鍵が yuta-eng と不一致
        note: r.status === 404 || r.status === 402 ? "到達OK・秘密鍵一致(未知/未払いsessionで想定どおり)" : undefined,
      };
    } catch (e) {
      result.upstream = { reachable: false, error: e instanceof Error ? e.message : "unknown" };
    }
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-nobit-secret"))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = provisionPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const payload = parsed.data;

  if (!isPaid(payload)) {
    console.info(`[provision] webhook: 未払いのためスキップ to=${maskEmail(payload.email)}`);
    return Response.json({ ok: true, skipped: "unpaid" });
  }

  try {
    const result = await provisionAccount(payload);
    console.info(`[provision] webhook: ${result.status} to=${maskEmail(result.email)}`);

    // ログイン情報(顧客)＋発行通知(運営者)を送信。
    // /setup と同じ決済を処理しても、Resend の冪等キーで二重送信を抑える。
    // 顧客メールが失敗した場合は 5xx にして、yuta-eng/Stripe の再送に乗せる。
    const email = await sendProvisionEmails({ result, payload, loginUrl: `${baseUrl(req)}/login` });
    if (!email.customer) {
      console.error(`[provision] 顧客メール送信失敗 to=${maskEmail(result.email)} status=${result.status}`);
      return Response.json(
        { ok: false, error: "email_failed", status: result.status, email },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, status: result.status, email });
  } catch (e) {
    // 5xx を返すと yuta-eng 側が再送してくれる(冪等なので再送は安全)。
    console.error(`[provision] webhook 失敗: ${e instanceof Error ? e.message : "unknown"}`);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
