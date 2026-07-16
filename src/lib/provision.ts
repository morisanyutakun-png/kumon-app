/**
 * yuta-eng(申込・決済サイト)からのアカウント発行ロジック。
 *
 * 決済は yuta-eng 側で完了済み。本アプリは「アカウント発行(=ログインできるように)」だけを担当する。
 * 運営が手動作成する生徒と同じ方式に統一する:
 *   - students 行に loginId(st~) + PIN(pinHash/pinPlain) を発行(active)。
 *   - ログインは既存の生徒ログイン(loginId + PIN)経路(auth.ts)をそのまま使う。
 *   - 契約情報は subscriptions に保存する。
 *   - 購入科目に一致する教材は、発行した生徒へ自動で割り当てる。
 *   - stripeSessionId を冪等キーにし、同じメールでも購入ごとに生徒を発行する。
 * 生成した st~ ログインID と PIN は、メール送信 / /setup 画面 / 生徒管理 で確認できる。
 */
import "server-only";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { students, subscriptions, subscriptionSubjects } from "@/db/schema";
import { assignPurchasedSubjects } from "@/lib/assign-purchased";
import { isTrialSubjectId } from "@/lib/subject-map";

/** grade コード → 表示用学年(中高部=secondary に解決される表記)。 */
const GRADE_LABEL: Record<string, string> = { h1: "高1", h2: "高2", h3: "高3", grad: "高卒", other: "その他" };
export function gradeLabel(code: string): string {
  return GRADE_LABEL[code] ?? code;
}

const subjectInputSchema = z.union([z.string(), z.array(z.string())]).optional().default("");
type SubjectInput = z.infer<typeof subjectInputSchema>;

/** yuta-eng 照会API / Webhook のペイロード。数値・真偽値は文字列で来ることがあるため寛容に受ける。 */
export const provisionPayloadSchema = z.object({
  type: z.string().optional(), // "new_purchase"(旧: "new_subscription")。値は分岐に未使用
  paid: z.union([z.boolean(), z.string()]).optional(),
  email: z.string().email(),
  name: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  studentName: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  subjects: subjectInputSchema,
  subjectLabels: z.string().optional().default(""),
  subjectCount: z.union([z.number(), z.string()]).optional(),
  amount: z.union([z.number(), z.string()]).optional(), // 購入金額(一回払い・新)
  monthlyAmount: z.union([z.number(), z.string()]).optional(), // 旧: 月額(後方互換)
  // お試し/本契約アップグレード連携(docs/trial-upgrade-protocol.md)。
  // yuta-eng は Registration(camelCase) / Stripe metadata(snake_case) の両表記があるため双方を寛容に受ける。
  plan: z.string().optional(), // "full" | "trial" | "upgrade"(既定 full)
  trialOf: z.string().optional(),
  trial_of: z.string().optional(),
  creditAmount: z.union([z.number(), z.string()]).optional(),
  credit_amount: z.union([z.number(), z.string()]).optional(),
  upgradeOf: z.string().optional(),
  upgrade_of: z.string().optional(),
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

function subjectIdsFromInput(input: SubjectInput): string[] {
  const raw = Array.isArray(input) ? input : input.split(",");
  return raw.map((s) => s.trim()).filter(Boolean);
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

  // お試し/本契約アップグレード連携(docs/trial-upgrade-protocol.md)。camel/snake 両表記を吸収。
  const plan = ((payload.plan || "full").trim() || "full");
  const trialOf = (payload.trialOf ?? payload.trial_of ?? "").trim() || null;
  const upgradeOf = (payload.upgradeOf ?? payload.upgrade_of ?? "").trim() || null;
  const creditAmount = toInt(payload.creditAmount ?? payload.credit_amount);

  let subjectIds = subjectIdsFromInput(payload.subjects);
  // plan=trial で subjects に *-trial が無い場合、trial_of から補う。
  // trial_of はカンマ区切り(複数科目)なので、必ず先に分割してから各idに -trial を付ける
  // (例 "math-1a,chemistry" → ["math-1a-trial","chemistry-trial"]。全体に付けると壊れる)。
  if (plan === "trial" && trialOf && !subjectIds.some(isTrialSubjectId)) {
    const derived = trialOf.split(",").map((s) => s.trim()).filter(Boolean).map((id) => `${id}-trial`);
    subjectIds = [...subjectIds, ...derived];
  }

  const contract = {
    organizationId: orgId,
    email,
    name: (payload.name || "").trim(),
    phone: (payload.phone || "").trim(),
    studentName,
    grade,
    gradeCode: (payload.grade || "").trim(),
    subjects: subjectIds.join(","),
    subjectLabels: (payload.subjectLabels || "").trim(),
    subjectCount: payload.subjectCount !== undefined ? toInt(payload.subjectCount) : subjectIds.length,
    monthlyAmount: toInt(payload.monthlyAmount), // 旧列(後方互換)
    amount: toInt(payload.amount ?? payload.monthlyAmount), // 購入金額(旧月額もフォールバック)
    plan,
    trialOf,
    creditAmount,
    upgradeOf,
    stripeCustomerId: payload.stripeCustomerId ?? null,
    stripeSubscriptionId: payload.stripeSubscriptionId ?? null, // 旧列(後方互換)
    stripePaymentIntentId: payload.stripePaymentIntentId ?? null,
    stripeSessionId,
  };

  // 本契約アップグレード: 既存のお試し生徒を昇格(新規生徒は作らない)。お試し生徒が居なければ通常発行にフォールバック。
  // 1トークン=1科目(upgrade_of は単一)。複数お試し保有でも、この科目のお試しを持つ生徒だけを昇格する。
  if (plan === "upgrade" && upgradeOf) {
    const trial = await findTrialStudentForSubject(orgId, email, upgradeOf);
    if (trial?.studentId) {
      const upgradeContract = { ...contract, status: "active" as const, activatedAt: new Date(), studentId: trial.studentId };
      const [sub] = await db
        .insert(subscriptions)
        .values(upgradeContract)
        .onConflictDoUpdate({ target: subscriptions.stripeSessionId, set: upgradeContract })
        .returning({ id: subscriptions.id });
      await replaceSubjects(sub.id, subjectIds); // = [upgradeOf]
      // 監査用に当該お試し契約へ upgraded_at を刻む(バナーの停止は plan=upgrade 契約の有無で判定)。
      await db.update(subscriptions).set({ upgradedAt: new Date() }).where(eq(subscriptions.id, trial.id));
      await autoAssignPurchasedSubjects(orgId, trial.studentId); // upgradeOf のフル教材を割当
      const creds = await fetchStudentCreds(trial.studentId);
      return { status: "already_active", email, subscriptionId: sub.id, ...(creds ?? { studentId: trial.studentId }) };
    }
    // お試し生徒が見つからない → 通常発行(フル教材)にフォールバック。
  }

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
    if (existing) {
      await autoAssignPurchasedSubjects(orgId, sub.studentId);
      return { status: "already_active", email, subscriptionId: sub.id, ...existing };
    }
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
      if (other) {
        await autoAssignPurchasedSubjects(orgId, s2.studentId);
        return { status: "already_active", email, subscriptionId: sub.id, ...other };
      }
    }
    throw new Error("subscription の生徒紐づけに失敗しました。");
  }

  await autoAssignPurchasedSubjects(orgId, student.id);
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

/**
 * email/org のお試し契約のうち、指定フル科目のお試し(`${fullId}-trial`)を科目に含み、
 * 生徒に紐付いている契約を1件返す(最新)。複数お試しを1契約に含む場合も科目単位で正しく引ける。
 */
async function findTrialStudentForSubject(
  orgId: string,
  email: string,
  fullId: string,
): Promise<{ id: string; studentId: string } | null> {
  const rows = await db
    .select({ id: subscriptions.id, studentId: subscriptions.studentId })
    .from(subscriptions)
    .innerJoin(subscriptionSubjects, eq(subscriptionSubjects.subscriptionId, subscriptions.id))
    .where(
      and(
        eq(subscriptions.organizationId, orgId),
        eq(subscriptions.email, email),
        eq(subscriptions.plan, "trial"),
        isNotNull(subscriptions.studentId),
        eq(subscriptionSubjects.subjectId, `${fullId}-trial`),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const r = rows[0];
  return r?.studentId ? { id: r.id, studentId: r.studentId } : null;
}

/** 購入科目の自動割り当て。失敗してもアカウント発行は妨げない。 */
async function autoAssignPurchasedSubjects(organizationId: string, studentId: string): Promise<void> {
  try {
    const r = await assignPurchasedSubjects({ organizationId, studentId, assignedById: null });
    console.info(`[provision] 自動割り当て assigned=${r.assigned} matched=${r.matched} reason=${r.reason ?? "ok"}`);
  } catch (e) {
    console.error(`[provision] 自動割り当て失敗: ${e instanceof Error ? e.message : "unknown"}`);
  }
}
