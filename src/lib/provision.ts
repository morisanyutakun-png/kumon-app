/**
 * yuta-eng(申込・決済サイト)からのアカウント発行ロジック。
 *
 * 決済は yuta-eng 側で完了済み。本アプリは「アカウント発行(=ログインできるように)」だけを
 * 担当する。冪等に仮アカウント(users.status=pending)を作り、一回限り・期限付きの
 * setup_token を発行する。生徒は /setup でパスワードを設定すると active になる。
 *
 * アカウント方式(既存に合わせる):
 *   - 生徒本人が email + password でログイン → users(role=student) を作成
 *   - 学習進捗等は students 行に紐づくため students も作成し users.id と相互参照
 *   - パスワードは bcryptjs(cost 10)。認証は auth.ts の Credentials が users.passwordHash で照合。
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { and, eq, isNull, gt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  setupTokens,
  students,
  subscriptions,
  subscriptionSubjects,
  users,
} from "@/db/schema";

/** setup_token の有効期間(時間)。 */
export const SETUP_TOKEN_TTL_HOURS = 72;

/** grade コード → 表示用学年。中高部(secondary)に解決される表記にする。 */
const GRADE_LABEL: Record<string, string> = {
  h1: "高1",
  h2: "高2",
  h3: "高3",
  grad: "高卒",
  other: "その他",
};
export function gradeLabel(code: string): string {
  return GRADE_LABEL[code] ?? code;
}

/**
 * yuta-eng 照会API / Webhook のペイロード。数値・真偽値は文字列で来ることがあるため寛容に受ける。
 */
export const provisionPayloadSchema = z.object({
  type: z.string().optional(),
  paid: z.union([z.boolean(), z.string()]).optional(),
  email: z.string().email(),
  name: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  studentName: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  subjects: z.string().optional().default(""),
  subjectLabels: z.string().optional().default(""),
  subjectCount: z.union([z.number(), z.string()]).optional(),
  monthlyAmount: z.union([z.number(), z.string()]).optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
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

/** 新規作成中に「既に他方が作成済み」だった場合の内部シグナル(トランザクションをロールバックして既存パスへ)。 */
class ProvisionConflict extends Error {
  constructor() {
    super("provision conflict");
    this.name = "ProvisionConflict";
  }
}

export interface ProvisionResult {
  /** created=新規発行 / pending_reused=既存の仮アカウントを再利用 / already_active=本登録済み */
  status: "created" | "pending_reused" | "already_active";
  email: string;
  userId?: string;
  /** /setup で使う生トークン(created / pending_reused のときのみ)。 */
  setupToken?: string;
  subscriptionId?: string;
}

/**
 * 仮アカウントを冪等に upsert し、setup_token を発行する。
 * - 同一メールで既に active(本登録済み) → 何もしない(already_active)
 * - 同一メールで pending → 契約情報を更新し token を再発行(pending_reused)
 * - 未存在 → students + users(pending) + subscriptions を作成(created)
 */
export async function provisionAccount(payload: ProvisionPayload): Promise<ProvisionResult> {
  const orgId = provisionOrgId();
  const email = payload.email.trim().toLowerCase();
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
    monthlyAmount: toInt(payload.monthlyAmount),
    stripeCustomerId: payload.stripeCustomerId ?? null,
    stripeSubscriptionId: payload.stripeSubscriptionId ?? null,
    stripeSessionId: payload.stripeSessionId ?? null,
  };

  // 逐次の一般ケース(既に作成済み)を先に処理。
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existingPath(existing.id, existing.status, contract, subjectIds, email);

  // 新規作成。Webhook と /setup が同時に来ても 500 にしないよう ON CONFLICT で競合安全にする:
  //  - users は onConflictDoNothing → 競合(=他方が先に作成)なら user が返らない → 既存パスへ退避
  //    (DO NOTHING は競合行のロック解放まで待ってから no-op するため、退避時には相手が確定済み)
  //  - subscriptions は email 一意 → onConflictDoUpdate、subscription_subjects は onConflictDoNothing
  let createdUserId: string;
  let createdSubId: string | undefined;
  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          organizationId: orgId,
          email,
          name: studentName || email,
          role: "student",
          passwordHash: "", // pending: 未設定。/setup で設定するまでログイン不可。
          status: "pending",
        })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!user) throw new ProvisionConflict(); // 既存 → ロールバックして既存パスへ
      const [student] = await tx
        .insert(students)
        .values({ organizationId: orgId, name: studentName || email, grade, active: false })
        .returning({ id: students.id });
      await tx.update(students).set({ userId: user.id }).where(eq(students.id, student.id));
      const [sub] = await tx
        .insert(subscriptions)
        .values({ ...contract, userId: user.id, studentId: student.id, status: "pending" })
        .onConflictDoUpdate({
          target: subscriptions.email,
          set: { ...contract, userId: user.id, studentId: student.id },
        })
        .returning({ id: subscriptions.id });
      if (subjectIds.length > 0) {
        await tx
          .insert(subscriptionSubjects)
          .values(subjectIds.map((subjectId) => ({ subscriptionId: sub.id, subjectId })))
          .onConflictDoNothing();
      }
      return { userId: user.id, subscriptionId: sub.id };
    });
    createdUserId = created.userId;
    createdSubId = created.subscriptionId;
  } catch (e) {
    if (e instanceof ProvisionConflict) {
      // 競合: 別の実行(Webhook 等)が先に作成済み → 既存として扱う。
      const [u2] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (u2) return existingPath(u2.id, u2.status, contract, subjectIds, email);
    }
    throw e; // 想定外は投げる(/setup 側で復旧UIに変換)
  }

  const setupToken = await issueSetupToken(createdUserId);
  return { status: "created", email, userId: createdUserId, setupToken, subscriptionId: createdSubId };
}

/** 既存(pending=再利用 / active=登録済み)の生徒に対する応答。 */
async function existingPath(
  userId: string,
  status: string,
  contract: typeof subscriptions.$inferInsert,
  subjectIds: string[],
  email: string,
): Promise<ProvisionResult> {
  if (status === "active") {
    return { status: "already_active", email, userId };
  }
  // pending を再利用: 契約情報を更新し、token を再発行。
  await upsertSubscription(contract, userId, subjectIds);
  const setupToken = await issueSetupToken(userId);
  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.email, email))
    .limit(1);
  return { status: "pending_reused", email, userId, setupToken, subscriptionId: sub?.id };
}

/** pending 再利用時に契約情報を email キーで upsert し、科目を貼り直す。 */
async function upsertSubscription(
  contract: typeof subscriptions.$inferInsert,
  userId: string,
  subjectIds: string[],
) {
  const [existingSub] = await db
    .select({ id: subscriptions.id, studentId: subscriptions.studentId })
    .from(subscriptions)
    .where(eq(subscriptions.email, contract.email))
    .limit(1);
  if (existingSub) {
    await db
      .update(subscriptions)
      .set({ ...contract, userId })
      .where(eq(subscriptions.id, existingSub.id));
    await db
      .delete(subscriptionSubjects)
      .where(eq(subscriptionSubjects.subscriptionId, existingSub.id));
    if (subjectIds.length > 0) {
      await db
        .insert(subscriptionSubjects)
        .values(subjectIds.map((subjectId) => ({ subscriptionId: existingSub.id, subjectId })));
    }
  } else {
    // 競合(同時実行で他方が先に subscriptions を作成)でも 500 にしないよう onConflictDoUpdate。
    const [sub] = await db
      .insert(subscriptions)
      .values({ ...contract, userId, status: "pending" })
      .onConflictDoUpdate({ target: subscriptions.email, set: { ...contract, userId } })
      .returning({ id: subscriptions.id });
    if (subjectIds.length > 0) {
      await db
        .insert(subscriptionSubjects)
        .values(subjectIds.map((subjectId) => ({ subscriptionId: sub.id, subjectId })))
        .onConflictDoNothing();
    }
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** 一回限り・期限付きの setup_token を発行し、生トークンを返す(DBにはハッシュのみ保存)。 */
export async function issueSetupToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await db.insert(setupTokens).values({ userId, tokenHash: sha256(raw), expiresAt });
  return raw;
}

export interface SetupContext {
  userId: string;
  tokenId: string;
  email: string;
  studentName: string;
  subjectLabels: string;
  grade: string;
}

/** 生トークンを検証(期限内・未使用)。有効なら設定画面の表示情報を返す。無効なら null。 */
export async function verifySetupToken(rawToken: string): Promise<SetupContext | null> {
  if (!rawToken) return null;
  const [row] = await db
    .select()
    .from(setupTokens)
    .where(
      and(
        eq(setupTokens.tokenHash, sha256(rawToken)),
        isNull(setupTokens.usedAt),
        gt(setupTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  return buildContext(row.userId, row.id);
}

/** メールから設定画面の表示情報を引く(session_id フローで token を出さない場合の表示用)。 */
export async function setupContextForUser(userId: string, tokenId: string): Promise<SetupContext | null> {
  return buildContext(userId, tokenId);
}

async function buildContext(userId: string, tokenId: string): Promise<SetupContext | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  const [sub] = await db
    .select({
      studentName: subscriptions.studentName,
      subjectLabels: subscriptions.subjectLabels,
      grade: subscriptions.grade,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return {
    userId: user.id,
    tokenId,
    email: user.email,
    studentName: sub?.studentName ?? "",
    subjectLabels: sub?.subjectLabels ?? "",
    grade: sub?.grade ?? "",
  };
}

/** あるメールのアカウントが既に本登録(active)済みか。 */
export async function isAlreadyActive(email: string): Promise<boolean> {
  const [u] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return u?.status === "active";
}

/**
 * パスワードを設定して本登録(active)にする。既存方式どおり bcryptjs(cost 10)。
 * 冪等性: token を使用済みにし、二重実行を防ぐ。
 */
export async function activateAccount(opts: {
  userId: string;
  password: string;
  tokenId?: string;
}): Promise<{ email: string }> {
  const passwordHash = await bcrypt.hash(opts.password, 10);
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      // pwPlain は運営が生徒管理画面で確認・伝達する用途(既存の保護者/職員と同じ方針)。認証は passwordHash。
      .set({ passwordHash, pwPlain: opts.password.slice(0, 64), status: "active" })
      .where(eq(users.id, opts.userId))
      .returning({ email: users.email });
    // 紐づく生徒を有効化。
    await tx.update(students).set({ active: true }).where(eq(students.userId, opts.userId));
    await tx
      .update(subscriptions)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(subscriptions.userId, opts.userId));
    if (opts.tokenId) {
      await tx.update(setupTokens).set({ usedAt: new Date() }).where(eq(setupTokens.id, opts.tokenId));
    }
    return { email: user.email };
  });

  // 将来用の自動割り当て(既定OFF)。中高部教材が登録済みで、本登録時に購入科目の教材を
  // 自動で割り当てたい運用にしたくなったら PROVISION_AUTO_ASSIGN=1 を設定する。
  // 手動割り当て(運営の「購入科目の教材を割り当て」ボタン)と同じコアを再利用する。
  if (process.env.PROVISION_AUTO_ASSIGN === "1") {
    try {
      const [st] = await db
        .select({ id: students.id, organizationId: students.organizationId })
        .from(students)
        .where(eq(students.userId, opts.userId))
        .limit(1);
      if (st) {
        const { assignPurchasedSubjects } = await import("./assign-purchased");
        const r = await assignPurchasedSubjects({
          organizationId: st.organizationId,
          studentId: st.id,
          assignedById: null,
        });
        console.info(`[provision] 自動割り当て assigned=${r.assigned} matched=${r.matched} reason=${r.reason ?? "ok"}`);
      }
    } catch (e) {
      // 自動割り当て失敗は本登録自体を妨げない(運営が手動で割り当て可能)。
      console.error(`[provision] 自動割り当て失敗: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return result;
}
