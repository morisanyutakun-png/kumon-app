/**
 * 本契約アップグレード導線トークン(HMAC署名・依存追加なし)。
 * サーバー側専用(NOBIT_REGISTER_SECRET を読むため)。docs/trial-upgrade-protocol.md 準拠。
 *
 *   token = base64url(JSON payload) + "." + base64url(HMAC_SHA256(payloadPart, secret))
 *   payload = { s: フル科目ID, jti: お試しsubscription id, exp: 失効UNIX秒, c?: Stripe Customer ID }
 *
 * 生徒ホームで発行し `https://yuta-eng.com/apply?u=<token>` として提示する。
 * yuta-eng 側は同じ NOBIT_REGISTER_SECRET で署名検証し、`s` がカゴに入っているときだけ値引きを適用する。
 * 検証(verify)はテスト・将来のアプリ側チェック用に用意(一次防御は yuta-eng 側)。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function secret(): string {
  const s = process.env.NOBIT_REGISTER_SECRET;
  if (!s) throw new Error("NOBIT_REGISTER_SECRET が未設定です(本契約トークンの署名に必要)。");
  return s;
}

function sign(payloadPart: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadPart).digest());
}

export interface UpgradeTokenPayload {
  /** 本契約するフル科目ID(例 math-1a)。 */
  s: string;
  /** お試し subscription id(冪等/照合キー)。 */
  jti: string;
  /** 失効 UNIX 秒。 */
  exp: number;
  /** Stripe Customer ID(任意・記録用)。 */
  c?: string;
}

/** トークンを発行する。`nowSec` は呼び出し側から渡す(純粋・テスト容易)。既定TTL=72時間。 */
export function issueUpgradeToken(input: {
  s: string;
  jti: string;
  nowSec: number;
  ttlSeconds?: number;
  c?: string;
}): string {
  const payload: UpgradeTokenPayload = {
    s: input.s,
    jti: input.jti,
    exp: input.nowSec + (input.ttlSeconds ?? 72 * 3600),
    ...(input.c ? { c: input.c } : {}),
  };
  const pp = b64url(JSON.stringify(payload));
  return `${pp}.${sign(pp)}`;
}

export type VerifyResult =
  | { ok: true; payload: UpgradeTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** 署名・形式・期限を検証する。署名比較は定数時間(timingSafeEqual)。 */
export function verifyUpgradeToken(token: string, nowSec: number): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [pp, sig] = parts;

  const expected = sign(pp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  let payload: UpgradeTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(pp).toString("utf8")) as UpgradeTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload?.s !== "string" || typeof payload?.jti !== "string" || typeof payload?.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp < nowSec) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
