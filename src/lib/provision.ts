/**
 * yuta-eng(申込・決済サイト)からのアカウント発行ロジック。
 *
 * 決済は yuta-eng 側で完了済み。本アプリは「アカウント発行(=ログインできるように)」だけを担当する。
 * 運営が手動作成する生徒と同じ方式に統一する:
 *   - students 行に loginId(st~) + PIN(pinHash/pinPlain) を発行(active)。
 *   - ログインは既存の生徒ログイン(loginId + PIN)経路(auth.ts)をそのまま使う。
 *   - 契約情報は subscriptions に保存する。
 *   - stripeSessionId を冪等キーにし、同じメールでも購入ごとに生徒を発行する。
 * 生成した st~ ログインID と PIN は、メール送信 / /setup 画面 / 生徒管理 で確認できる。
 */
import "server-only";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { students, subscriptions, subscriptionSubjects } from "@/db/schema";

/** grade コード → 表示用学年(中高部=secondary に解決される表記)。 */
const GRADE_LABEL: Record<string, string> = { h1: "高1", h2: "高2", h3: "高3", grad: "高卒", other: "その他" };
export function gradeLabel(code: string): string {
  return GRADE_LABEL[code] ?? code;
}

/** yuta-eng 照会API / Webhook のペイロード。数値・真偽値は文字列で来ることがあるため寛容に受ける。 */
export const provisionPayloadSchema = z.object({
  type: z.string().optional(), // "new_purchase"(旧: "new_subscription")。値は分岐に未使用
  paid: z.union([z.boolean(), z.string()]).optional(),
  email: z.string().email(),
  name: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  studentName: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  subjects: z.string().optional().default(""),
  subjectLabels: z.string().optional().default(""),
  subjectCount: z.union([z.number(), z.string()]).optional(),
  amount: z.union([z.number(), z.string()]).optional(), // 購入金額(一回払い・新)
  monthlyAmount: z.union([z.number(), z.string()]).optional(), // 旧: 月額(後方互換)
  stripeCustomerId: z.string().optional(),
  stripePaymentIntentId: z.string().optional(), // 一回払い PaymentIntent(新)
  stripeSubscriptionId: z.string().optional(), // 旧: サブスクID(後方互換)
  stripeSessionId: z.string().optional(),
  createdAt: z.string().optional(),
});
export type ProvisionPayload = z.infer<typeof provisionPayloadSchema>;

export function isPaid(payload: ProvisionPayload): boolean {
  return payload.paid === true || payload.paid === "true";
}

function toInt(v: number | string | undefined): number {
  if (typeof v === "number") return Math.trunc(v);
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** ログ用にメールを部分マスク(個人情報を平文で大量に残さない)。 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${local.length > 2 ? "***" : ""}@${domain}`;
}

function provisionOrgId(): string {
  const id = process.env.NOBIT_PROVISION_ORG_ID;
  if (!id) {
    throw new Error(
      "NOBIT_PROVISION_ORG_ID が未設定です。中高部アカウントの発行先organizationを指定してください。",
    );
  }
  return id;
}

/** 4桁PIN(数字)。crypto 乱数。 */
function genPin(): string {
  const b = randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) s += String(b[i] % 10);
  return s;
}
/** st + 4桁。students.loginId は一意なので、空いている ID を探して返す。 */
async function ensureUniqueLoginId(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const b = randomBytes(2);
    const id = "st" + (1000 + (((b[0] << 8) | b[1]) % 9000));
    const [dup] = await db.select({ id: students.id }).from(students).where(eq(students.loginId, id)).limit(1);
    if (!dup) return id;
  }
  return "st" + Date.now().toString().slice(-6);
}

export interface ProvisionResult {
  /** created=新規発行(loginId/pin あり) / already_active=既に発行済み */
  status: "created" | "already_active";
  email: string;
  studentId?: string;
  /** 生徒のログインID(st~) と PIN。メール送信・画面表示用。 */
  loginId?: string;
  pin?: string;
  subscriptionId?: string;
}

/**
 * 冪等にアカウントを発行する。stripeSessionId を冪等キーにし、Webhook と /setup が同時に来ても
 * 二重作成・500 にならないようにする(subscription を Stripe session 一意で upsert →
 * 条件付きUPDATEで生徒を1件だけ紐付け)。運営作成生徒と同じ st~ ログインID + PIN を発行する。
 */
export async function provisionAccount(payload: ProvisionPayload): Promise<ProvisionResult> {
  const orgId = provisionOrgId();
  const email = payload.email.trim().toLowerCase();
  const stripeSessionId = payload.stripeSessionId?.trim();
  if (!stripeSessionId) {
    throw new Error("stripeSessionId が未設定です。購入単位の冪等発行に必要です。");
  }

  const studentName = (payload.studentName || payload.name || "").trim();
  const grade = gradeLabel((payload.grade || "").trim());
  const subjectIds = (payload.subjects || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const contract = {
    organizationId: orgId,
    email,
    name: (payload.name || "").trim(),
    phone: (payload.phone || "").trim(),
    studentName,
    grade,
    gradeCode: (payload.grade || "").trim(),
    subjects: (payload.subjects || "").trim(),
    subjectLabels: (payload.subjectLabels || "").trim(),
    subjectCount: payload.subjectCount !== undefined ? toInt(payload.subjectCount) : subjectIds.length,
    monthlyAmount: toInt(payload.monthlyAmount), // 旧列(後方互換)
    amount: toInt(payload.amount ?? payload.monthlyAmount), // 購入金額(旧月額もフォールバック)
    stripeCustomerId: payload.stripeCustomerId ?? null,
    stripeSubscriptionId: payload.stripeSubscriptionId ?? null, // 旧列(後方互換)
    stripePaymentIntentId: payload.stripePaymentIntentId ?? null,
    stripeSessionId,
  };

  const activeContract = { ...contract, status: "active" as const, activatedAt: new Date() };

  // 契約(subscription)を Stripe session 一意で upsert。これが冪等の土台。
  const [sub] = await db
    .insert(subscriptions)
    .values(activeContract)
    .onConflictDoUpdate({
      target: subscriptions.stripeSessionId,
      set: activeContract,
    })
    .returning({ id: subscriptions.id, studentId: subscriptions.studentId });

  await replaceSubjects(sub.id, subjectIds);

  // 既に生徒が紐づいていれば、その資格情報を返す(再作成しない)。
  if (sub.studentId) {
    const existing = await fetchStudentCreds(sub.studentId);
    if (existing) return { status: "already_active", email, subscriptionId: sub.id, ...existing };
  }

  // 生徒(st~ + PIN)を作成し、条件付きUPDATEで紐付け(同時実行でも1件だけが紐づく)。
  const loginId = await ensureUniqueLoginId();
  const pin = genPin();
  const pinHash = await bcrypt.hash(pin, 10);
  const [student] = await db
    .insert(students)
    .values({ organizationId: orgId, name: studentName || email, grade, loginId, pinHash, pinPlain: pin, active: true })
    .returning({ id: students.id });

  const [claimed] = await db
    .update(subscriptions)
    .set({ studentId: student.id })
    .where(and(eq(subscriptions.id, sub.id), isNull(subscriptions.studentId)))
    .returning({ id: subscriptions.id });

  if (!claimed) {
    // 競合: 別実行が先に生徒を紐付けた → 自分が作った生徒は破棄し、相手のものを返す。
    await db.delete(students).where(eq(students.id, student.id));
    const [s2] = await db
      .select({ studentId: subscriptions.studentId })
      .from(subscriptions)
      .where(eq(subscriptions.id, sub.id))
      .limit(1);
    if (s2?.studentId) {
      const other = await fetchStudentCreds(s2.studentId);
      if (other) return { status: "already_active", email, subscriptionId: sub.id, ...other };
    }
  }

  await maybeAutoAssign(orgId, student.id);
  return { status: "created", email, studentId: student.id, loginId, pin, subscriptionId: sub.id };
}

async function fetchStudentCreds(
  studentId: string,
): Promise<{ studentId: string; loginId?: string; pin?: string } | null> {
  const [st] = await db
    .select({ id: students.id, loginId: students.loginId, pinPlain: students.pinPlain })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!st) return null;
  return { studentId: st.id, loginId: st.loginId ?? undefined, pin: st.pinPlain ?? undefined };
}

async function replaceSubjects(subscriptionId: string, subjectIds: string[]): Promise<void> {
  await db.delete(subscriptionSubjects).where(eq(subscriptionSubjects.subscriptionId, subscriptionId));
  if (subjectIds.length > 0) {
    await db
      .insert(subscriptionSubjects)
      .values(subjectIds.map((subjectId) => ({ subscriptionId, subjectId })))
      .onConflictDoNothing();
  }
}

/** 将来用の自動割り当て(既定OFF / PROVISION_AUTO_ASSIGN=1)。失敗しても発行は妨げない。 */
async function maybeAutoAssign(organizationId: string, studentId: string): Promise<void> {
  if (process.env.PROVISION_AUTO_ASSIGN !== "1") return;
  try {
    const { assignPurchasedSubjects } = await import("./assign-purchased");
    const r = await assignPurchasedSubjects({ organizationId, studentId, assignedById: null });
    console.info(`[provision] 自動割り当て assigned=${r.assigned} matched=${r.matched} reason=${r.reason ?? "ok"}`);
  } catch (e) {
    console.error(`[provision] 自動割り当て失敗: ${e instanceof Error ? e.message : "unknown"}`);
  }
}
