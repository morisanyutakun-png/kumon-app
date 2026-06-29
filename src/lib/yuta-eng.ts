/**
 * yuta-eng(申込・決済サイト)の照会API呼び出し。
 *   GET {YUTA_ENG_BASE_URL}/api/provision/session?session_id=cs_xxx
 *   ヘッダ: x-nobit-secret: <共有シークレット>
 * 未払い=402 / 無効=404 / それ以外のエラーは reason で区別して返す。
 */
import "server-only";

import { provisionPayloadSchema, type ProvisionPayload } from "./provision";

export type SessionLookup =
  | { ok: true; payload: ProvisionPayload }
  | { ok: false; status: number; reason: "unpaid" | "not_found" | "error" };

export async function fetchProvisionSession(sessionId: string): Promise<SessionLookup> {
  const base = process.env.YUTA_ENG_BASE_URL ?? "https://yuta-eng.com";
  const secret = process.env.NOBIT_REGISTER_SECRET ?? "";
  if (!sessionId) return { ok: false, status: 400, reason: "not_found" };

  let res: Response;
  try {
    res = await fetch(`${base}/api/provision/session?session_id=${encodeURIComponent(sessionId)}`, {
      headers: { "x-nobit-secret": secret },
      cache: "no-store",
    });
  } catch (e) {
    console.error(`[provision] 照会API 到達不可 base=${base} err=${e instanceof Error ? e.message : "unknown"} secretSet=${!!secret}`);
    return { ok: false, status: 0, reason: "error" };
  }

  if (res.status === 402) return { ok: false, status: 402, reason: "unpaid" };
  if (res.status === 404) return { ok: false, status: 404, reason: "not_found" };
  if (!res.ok) {
    // 401 ならこちらの NOBIT_REGISTER_SECRET が yuta-eng 側と不一致の可能性が高い。
    console.error(`[provision] 照会API 異常応答 status=${res.status} (401=シークレット不一致の疑い / 5xx=yuta-eng側) secretSet=${!!secret}`);
    return { ok: false, status: res.status, reason: "error" };
  }

  const json = await res.json().catch(() => null);
  const parsed = provisionPayloadSchema.safeParse(json);
  if (!parsed.success) {
    // 200 だが期待した形ではない(email欠落など)。yuta-eng の応答形の問題。
    console.error(`[provision] 照会API 応答形が不正(200だがスキーマ不一致): ${parsed.error?.issues?.map((i) => i.path.join(".")).join(",")}`);
    return { ok: false, status: res.status, reason: "error" };
  }
  return { ok: true, payload: parsed.data };
}
