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
import { gradeLabel, type ProvisionPayload, type ProvisionResult } from "./provision";

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

  // 運営者(admin/operator でメールあり)＋ 明示指定(OPERATOR_NOTIFY_EMAIL) へ詳細通知。
  try {
    const recipients = new Set<string>();
    const orgId = process.env.NOBIT_PROVISION_ORG_ID;
    if (orgId) {
      const admins = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.organizationId, orgId), inArray(users.role, ["admin", "operator"])));
      for (const a of admins) if (a.email) recipients.add(a.email.toLowerCase());
    }
    // 任意: 確実に届けたい運営者アドレス(カンマ区切り)。
    for (const e of (process.env.OPERATOR_NOTIFY_EMAIL ?? "").split(",")) {
      const v = e.trim().toLowerCase();
      if (v) recipients.add(v);
    }
    const to = [...recipients];
    if (to.length > 0) {
      await sendOperatorNotification(to, {
        studentName,
        grade: gradeLabel((payload.grade || "").trim()),
        loginId: result.loginId,
        pin: result.pin,
        email: result.email,
        applicantName: payload.name,
        phone: payload.phone,
        subjectLabels: payload.subjectLabels,
        subjectCount: payload.subjectCount,
        monthlyAmount: payload.monthlyAmount,
        stripeCustomerId: payload.stripeCustomerId,
        stripeSubscriptionId: payload.stripeSubscriptionId,
        stripeSessionId: payload.stripeSessionId,
      });
    }
  } catch (e) {
    console.error(`[provision] 運営者通知の送信準備に失敗: ${e instanceof Error ? e.message : "unknown"}`);
  }
}
