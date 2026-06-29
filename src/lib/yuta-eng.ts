/**
 * yuta-eng(申込・決済サイト)の照会API呼び出し。
 *   GET {YUTA_ENG_BASE_URL}/api/provision/session?session_id=cs_xxx
 *   ヘッダ: x-nobit-secret: <共有シークレット>
 * 未払い=402 / 無効=404 / それ以外のエラーは reason で区別して返す。
 * detail は画面デバッグ用の技術詳細(秘密の値は含めない)。
 */
import "server-only";

import { provisionPayloadSchema, type ProvisionPayload } from "./provision";

export type SessionLookup =
  | { ok: true; payload: ProvisionPayload }
  | { ok: false; status: number; reason: "unpaid" | "not_found" | "error"; detail?: string };

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function fetchProvisionSession(sessionId: string): Promise<SessionLookup> {
  const base = process.env.YUTA_ENG_BASE_URL ?? "https://yuta-eng.com";
  const secret = process.env.NOBIT_REGISTER_SECRET ?? "";
  const host = hostOf(base);
  if (!sessionId) return { ok: false, status: 400, reason: "not_found", detail: "session_id が空です" };
  if (!secret) {
    // ここに来た時点で NOBIT_REGISTER_SECRET が未設定(=デプロイにenvが未反映の可能性)。
    console.error(`[provision] NOBIT_REGISTER_SECRET 未設定 base=${host}`);
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/provision/session?session_id=${encodeURIComponent(sessionId)}`, {
      headers: { "x-nobit-secret": secret },
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(`[provision] 照会API 到達不可 base=${host} err=${msg} secretSet=${!!secret}`);
    return { ok: false, status: 0, reason: "error", detail: `照会APIに到達できません (base=${host}, ${msg})` };
  }

  if (res.status === 402) return { ok: false, status: 402, reason: "unpaid", detail: `status=402 (未払い)` };
  if (res.status === 404) return { ok: false, status: 404, reason: "not_found", detail: `status=404 (session_id 未存在/無効)` };
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    console.error(`[provision] 照会API 異常応答 status=${res.status} secretSet=${!!secret} body=${body}`);
    const hint =
      res.status === 401
        ? "401: NOBIT_REGISTER_SECRET が yuta-eng 側と不一致の疑い"
        : res.status >= 500
          ? `${res.status}: yuta-eng 側のサーバーエラー`
          : `${res.status}`;
    return {
      ok: false,
      status: res.status,
      reason: "error",
      detail: `照会API status=${hint} / secretSet=${!!secret} / base=${host}${body ? ` / body=${body}` : ""}`,
    };
  }

  const json = await res.json().catch(() => null);
  const parsed = provisionPayloadSchema.safeParse(json);
  if (!parsed.success) {
    const fields = parsed.error?.issues?.map((i) => `${i.path.join(".") || "(root)"}:${i.message}`).join(", ");
    console.error(`[provision] 照会API 応答形が不正(200だがスキーマ不一致): ${fields}`);
    return {
      ok: false,
      status: res.status,
      reason: "error",
      detail: `照会APIは200だが応答形が仕様と不一致 (yuta-eng側): ${fields}`,
    };
  }
  return { ok: true, payload: parsed.data };
}
