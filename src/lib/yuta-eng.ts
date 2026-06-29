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
  } catch {
    return { ok: false, status: 0, reason: "error" };
  }

  if (res.status === 402) return { ok: false, status: 402, reason: "unpaid" };
  if (res.status === 404) return { ok: false, status: 404, reason: "not_found" };
  if (!res.ok) return { ok: false, status: res.status, reason: "error" };

  const json = await res.json().catch(() => null);
  const parsed = provisionPayloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, status: res.status, reason: "error" };
  return { ok: true, payload: parsed.data };
}
