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
 *   4. setup_token を発行し、パスワード設定リンクをメール送信
 *   5. 常に 200(yuta-eng はレスポンス本文を使わない)。再試行のため失敗時のみ 5xx。
 */
import { timingSafeEqual } from "node:crypto";

import { sendSetupEmail } from "@/lib/email";
import { isPaid, maskEmail, provisionAccount, provisionPayloadSchema } from "@/lib/provision";

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

    // 本登録済み以外は設定リンクをメール送信(失敗してもアカウントは作成済み)。
    if (result.setupToken) {
      const link = `${baseUrl(req)}/setup?token=${encodeURIComponent(result.setupToken)}`;
      await sendSetupEmail({
        to: result.email,
        link,
        studentName: payload.studentName || payload.name,
        subjectLabels: payload.subjectLabels,
      });
    }
    return Response.json({ ok: true, status: result.status });
  } catch (e) {
    // 5xx を返すと yuta-eng 側が再送してくれる(冪等なので再送は安全)。
    console.error(`[provision] webhook 失敗: ${e instanceof Error ? e.message : "unknown"}`);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
