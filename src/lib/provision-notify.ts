/**
 * 発行時のメール送信(顧客＝ログイン情報 / 運営者＝発行通知)。
 * Webhook と /setup の両方から呼べる。
 * 同じ決済の再実行でも資格情報が取れるなら再送できるようにし、送信成否を呼び出し元へ返す。
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
}): Promise<{ customer: boolean; operator: boolean | null; skipped: boolean }> {
  const { result, payload, loginUrl } = opts;
  if (!result.loginId || !result.pin) {
    return { customer: false, operator: null, skipped: true };
  }

  const studentName = payload.studentName || payload.name;

  // 顧客へログイン情報。
  const customer = await sendCredentialsEmail({
    to: result.email,
    loginId: result.loginId,
    pin: result.pin,
    loginUrl,
    studentName,
    subjectLabels: payload.subjectLabels,
  });

  // 運営者(admin/operator でメールあり)＋ 明示指定(OPERATOR_NOTIFY_EMAIL) へ詳細通知。
  let operator: boolean | null = null;
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
      const sent = await sendOperatorNotification(to, {
        studentName,
        grade: gradeLabel((payload.grade || "").trim()),
        loginId: result.loginId,
        pin: result.pin,
        email: result.email,
        applicantName: payload.name,
        phone: payload.phone,
        subjectLabels: payload.subjectLabels,
        subjectCount: payload.subjectCount,
        amount: payload.amount ?? payload.monthlyAmount,
        stripeCustomerId: payload.stripeCustomerId,
        stripePaymentIntentId: payload.stripePaymentIntentId,
        stripeSubscriptionId: payload.stripeSubscriptionId,
        stripeSessionId: payload.stripeSessionId,
      });
      operator = sent.ok;
    }
  } catch (e) {
    operator = false;
    console.error(`[provision] 運営者通知の送信準備に失敗: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return { customer: customer.ok, operator, skipped: false };
}
