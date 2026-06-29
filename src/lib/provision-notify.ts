/**
 * 発行時のメール送信(顧客＝ログイン情報 / 運営者＝発行通知)。
 * Webhook と /setup の両方から呼べる。新規発行(created)時のみ送る。
 * すべて try/catch 済みの送信関数を使うので、ここが原因でページ/リクエストが落ちることはない。
 */
import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { sendCredentialsEmail, sendOperatorNotification } from "./email";
import type { ProvisionPayload, ProvisionResult } from "./provision";

export async function sendProvisionEmails(opts: {
  result: ProvisionResult;
  payload: ProvisionPayload;
  loginUrl: string;
}): Promise<void> {
  const { result, payload, loginUrl } = opts;
  // 新規発行のときだけ送る(冪等: 2回目以降の already_active では送らない=重複防止)。
  if (result.status !== "created" || !result.loginId || !result.pin) return;

  const studentName = payload.studentName || payload.name;

  // 顧客へログイン情報。
  await sendCredentialsEmail({
    to: result.email,
    loginId: result.loginId,
    pin: result.pin,
    loginUrl,
    studentName,
    subjectLabels: payload.subjectLabels,
  });

  // 運営者(admin/operator でメールあり)へ通知。
  try {
    const orgId = process.env.NOBIT_PROVISION_ORG_ID;
    if (!orgId) return;
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, orgId), inArray(users.role, ["admin", "operator"])));
    const to = admins.map((a) => a.email).filter((e): e is string => !!e);
    if (to.length > 0) {
      await sendOperatorNotification(to, {
        studentName,
        loginId: result.loginId,
        email: result.email,
        subjectLabels: payload.subjectLabels,
      });
    }
  } catch (e) {
    console.error(`[provision] 運営者通知の送信準備に失敗: ${e instanceof Error ? e.message : "unknown"}`);
  }
}
