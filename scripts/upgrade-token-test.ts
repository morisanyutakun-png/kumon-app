/**
 * upgrade-token の単体テスト(依存追加なし)。
 *   npm run test:token
 * 署名OK / 改竄NG / 期限切れNG / 秘密鍵不一致NG を検証する。
 */
process.env.NOBIT_REGISTER_SECRET = "test-secret-please-change";

import { issueUpgradeToken, verifyUpgradeToken } from "@/lib/upgrade-token";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`  NG  ${name}`);
  }
}

const now = 1_730_000_000; // 固定(Date.now は使わない)

// 1) 正常発行→検証
const token = issueUpgradeToken({ s: "math-1a", jti: "sub-123", nowSec: now, c: "cus_abc" });
const v = verifyUpgradeToken(token, now);
check("署名OK: verify success", v.ok === true);
if (v.ok) {
  check("payload.s", v.payload.s === "math-1a");
  check("payload.jti", v.payload.jti === "sub-123");
  check("payload.c", v.payload.c === "cus_abc");
  check("payload.exp = now+72h", v.payload.exp === now + 72 * 3600);
}

// 2) 改竄(payload部を差し替え)→署名不一致
const [pp, sig] = token.split(".");
const forgedPayload = Buffer.from(JSON.stringify({ s: "math-3c", jti: "sub-123", exp: now + 3600 }))
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const forged = `${forgedPayload}.${sig}`;
const vf = verifyUpgradeToken(forged, now);
check("改竄NG: bad_signature", vf.ok === false && vf.reason === "bad_signature");

// 3) 署名部の改竄→署名不一致
const vs = verifyUpgradeToken(`${pp}.${sig.slice(0, -2)}XY`, now);
check("署名改竄NG", vs.ok === false && vs.reason === "bad_signature");

// 4) 期限切れ
const shortTok = issueUpgradeToken({ s: "math-1a", jti: "sub-1", nowSec: now, ttlSeconds: 10 });
const vexp = verifyUpgradeToken(shortTok, now + 11);
check("期限切れNG: expired", vexp.ok === false && vexp.reason === "expired");

// 5) 形式不正
check("形式不正NG", verifyUpgradeToken("not-a-token", now).ok === false);

// 6) 秘密鍵不一致(別の鍵で署名されたトークンは検証で落ちる)
process.env.NOBIT_REGISTER_SECRET = "another-secret";
const vwrong = verifyUpgradeToken(token, now);
check("鍵不一致NG: bad_signature", vwrong.ok === false);
process.env.NOBIT_REGISTER_SECRET = "test-secret-please-change";

if (failures > 0) {
  console.error(`\n✗ upgrade-token: ${failures} 件失敗`);
  process.exit(1);
}
console.log("\n✓ upgrade-token: 全テスト通過");
process.exit(0);
