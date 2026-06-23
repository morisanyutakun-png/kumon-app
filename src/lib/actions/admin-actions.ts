"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { asc } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  guardianStudents,
  materialFiles,
  materials,
  students,
  submissions,
  units,
  users,
} from "@/db/schema";
import { requireAdmin, requireOperator } from "@/lib/access";
import { saveBlob } from "@/lib/blob";
import { initialSessionRange } from "@/lib/progress-db";

export interface FormState {
  error?: string;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

// =============================================================================
// 生徒
// =============================================================================

export async function createStudent(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const grade = str(fd, "grade");
  const loginId = str(fd, "loginId");
  const pin = str(fd, "pin");
  if (!name) return { error: "氏名を入力してください。" };

  if (loginId) {
    const [dup] = await db
      .select()
      .from(students)
      .where(eq(students.loginId, loginId))
      .limit(1);
    if (dup) return { error: "そのログインIDは既に使われています。" };
  }

  await db.insert(students).values({
    organizationId: p.organizationId,
    name,
    grade,
    loginId: loginId || null,
    pinHash: loginId && pin ? await bcrypt.hash(pin, 10) : null,
  });

  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const grade = str(fd, "grade");
  const loginId = str(fd, "loginId");
  const pin = str(fd, "pin");
  const active = fd.get("active") !== null;
  if (!id || !name) return { error: "氏名を入力してください。" };

  const [target] = await db
    .select()
    .from(students)
    .where(
      and(eq(students.id, id), eq(students.organizationId, p.organizationId)),
    )
    .limit(1);
  if (!target) return { error: "生徒が見つかりません。" };

  if (loginId) {
    const [dup] = await db
      .select()
      .from(students)
      .where(eq(students.loginId, loginId))
      .limit(1);
    if (dup && dup.id !== id) {
      return { error: "そのログインIDは既に使われています。" };
    }
  }

  const patch: Partial<typeof students.$inferInsert> = {
    name,
    grade,
    loginId: loginId || null,
    active,
  };
  // PIN は入力があったときだけ更新。loginId を消したら pin も消す。
  if (!loginId) {
    patch.pinHash = null;
    patch.pinPlain = null;
  } else if (pin) {
    patch.pinHash = await bcrypt.hash(pin, 10);
    patch.pinPlain = pin;
  }

  await db.update(students).set(patch).where(eq(students.id, id));

  revalidatePath("/students");
  redirect("/students");
}

function randomPin(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function randomPassword(n = 8): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function randomLoginId(): string {
  return "st" + Math.floor(1000 + Math.random() * 9000);
}

/** loginId を一意にする (空/重複なら自動生成)。 */
async function ensureUniqueLoginId(candidate: string): Promise<string> {
  let id = candidate.trim();
  for (let i = 0; i < 30; i++) {
    if (!id) id = randomLoginId();
    const [dup] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.loginId, id))
      .limit(1);
    if (!dup) return id;
    id = randomLoginId();
  }
  return randomLoginId() + Math.floor(Math.random() * 100);
}

/**
 * スプレッドシート風の行から生徒を1人追加。ログインID/PINは未入力なら自動割当。
 * 実際に設定された loginId / pin を返す(発行内容の控え用)。
 */
export async function quickAddStudent(
  fd: FormData,
): Promise<{ name: string; loginId: string; pin: string }> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const grade = str(fd, "grade");
  if (!name) throw new Error("氏名を入力してください。");

  const loginId = await ensureUniqueLoginId(str(fd, "loginId"));
  const pin = str(fd, "pin") || randomPin();

  await db.insert(students).values({
    organizationId: p.organizationId,
    name,
    grade,
    loginId,
    pinHash: await bcrypt.hash(pin, 10),
    pinPlain: pin,
    active: true,
  });

  revalidatePath("/students");
  revalidatePath("/assignments");
  return { name, loginId, pin };
}

export interface RosterAddResult {
  studentName: string;
  loginId: string;
  pin: string;
  guardian?: { name: string; email: string; password: string | null };
}

/**
 * 1行で 生徒(+保護者) を追加。保護者の氏名/メールがあれば作成し生徒に紐づける
 * (既存メールの保護者がいれば再利用して紐づけ)。発行した認証情報を返す。
 */
export async function addStudentWithGuardian(
  fd: FormData,
): Promise<RosterAddResult> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const grade = str(fd, "grade");
  if (!name) throw new Error("生徒の氏名を入力してください。");

  const loginId = await ensureUniqueLoginId(str(fd, "loginId"));
  const pin = str(fd, "pin") || randomPin();

  const gName = str(fd, "gName");
  const gEmail = str(fd, "gEmail").toLowerCase();
  if ((gName && !gEmail) || (!gName && gEmail)) {
    throw new Error("保護者は氏名とメールアドレスの両方を入力してください。");
  }
  const gPassword = str(fd, "gPassword") || randomPassword();

  // 生徒を作成
  const [student] = await db
    .insert(students)
    .values({
      organizationId: p.organizationId,
      name,
      grade,
      loginId,
      pinHash: await bcrypt.hash(pin, 10),
      pinPlain: pin,
      active: true,
    })
    .returning();

  let guardianOut: RosterAddResult["guardian"];
  if (gName && gEmail) {
    let [parent] = await db
      .select()
      .from(users)
      .where(eq(users.email, gEmail))
      .limit(1);
    if (parent && parent.role !== "parent") {
      throw new Error("そのメールアドレスは別の用途で使われています。");
    }
    if (!parent) {
      [parent] = await db
        .insert(users)
        .values({
          organizationId: p.organizationId,
          name: gName,
          email: gEmail,
          role: "parent",
          passwordHash: await bcrypt.hash(gPassword, 10),
          pwPlain: gPassword,
        })
        .returning();
      guardianOut = { name: gName, email: gEmail, password: gPassword };
    } else {
      // 既存保護者: パスワードは変更しない
      guardianOut = { name: parent.name, email: parent.email, password: null };
    }
    await db.insert(guardianStudents).values({
      organizationId: p.organizationId,
      guardianUserId: parent.id,
      studentId: student.id,
    });
  }

  revalidatePath("/students");
  revalidatePath("/assignments");
  return { studentName: name, loginId, pin, guardian: guardianOut };
}

/** 行から保護者を追加。パスワードは未入力なら自動割当。設定値を返す。 */
export async function quickAddGuardian(
  fd: FormData,
): Promise<{ name: string; email: string; password: string }> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  if (!name) throw new Error("氏名を入力してください。");
  if (!email) throw new Error("メールアドレスを入力してください。");
  const password = str(fd, "password") || randomPassword();

  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dup) throw new Error("そのメールアドレスは既に登録されています。");

  await db.insert(users).values({
    organizationId: p.organizationId,
    name,
    email,
    role: "parent",
    passwordHash: await bcrypt.hash(password, 10),
    pwPlain: password,
  });
  revalidatePath("/students");
  return { name, email, password };
}

/** 行から教材を追加 (教科/教材名/進め方)。番号範囲や単元は編集で設定。 */
export async function quickAddMaterial(fd: FormData): Promise<{ name: string }> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const subject = str(fd, "subject");
  const ptRaw = str(fd, "progressType");
  const progressType =
    ptRaw === "chapter" || ptRaw === "number" ? ptRaw : "manual";
  if (!name) throw new Error("教材名を入力してください。");

  await db.insert(materials).values({
    organizationId: p.organizationId,
    name,
    subject,
    progressType,
  });
  revalidatePath("/materials");
  revalidatePath("/assignments");
  return { name };
}

export async function deleteStudent(studentId: string) {
  const p = await requireOperator();
  await db
    .delete(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, p.organizationId),
      ),
    );
  revalidatePath("/students");
  revalidatePath("/dashboard");
}

// =============================================================================
// 保護者 (parent ユーザー)
// =============================================================================

export async function createGuardian(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!name || !email || !password) {
    return { error: "氏名・メール・パスワードをすべて入力してください。" };
  }

  const [dup] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (dup) return { error: "そのメールアドレスは既に登録されています。" };

  await db.insert(users).values({
    organizationId: p.organizationId,
    name,
    email,
    role: "parent",
    passwordHash: await bcrypt.hash(password, 10),
    pwPlain: password,
  });

  revalidatePath("/students");
  redirect("/students");
}

/** 保護者と生徒を紐づける。 */
export async function linkGuardianStudent(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const guardianUserId = str(fd, "guardianUserId");
  const studentId = str(fd, "studentId");
  if (!guardianUserId || !studentId) {
    return { error: "保護者と生徒を選択してください。" };
  }

  // 同 org のリソースか確認
  const [g] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, guardianUserId),
        eq(users.organizationId, p.organizationId),
        eq(users.role, "parent"),
      ),
    )
    .limit(1);
  const [s] = await db
    .select()
    .from(students)
    .where(
      and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)),
    )
    .limit(1);
  if (!g || !s) return { error: "対象が見つかりません。" };

  const [existing] = await db
    .select()
    .from(guardianStudents)
    .where(
      and(
        eq(guardianStudents.guardianUserId, guardianUserId),
        eq(guardianStudents.studentId, studentId),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(guardianStudents).values({
      organizationId: p.organizationId,
      guardianUserId,
      studentId,
    });
  }

  revalidatePath("/students");
  // 紐づけ直後に最新の担当生徒が反映されるよう再読み込みする。
  redirect("/students");
}

// =============================================================================
// 教材
// =============================================================================

export async function createMaterial(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const name = str(fd, "name");
  const subject = str(fd, "subject");
  const description = str(fd, "description");
  if (!name) return { error: "教材名を入力してください。" };

  await db.insert(materials).values({
    organizationId: p.organizationId,
    name,
    subject,
    description,
    progressType: "manual",
  });

  revalidatePath("/materials");
  redirect("/materials");
}

export async function updateMaterial(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const subject = str(fd, "subject");
  const description = str(fd, "description");
  if (!id || !name) return { error: "教材名を入力してください。" };

  const [target] = await db
    .select()
    .from(materials)
    .where(
      and(eq(materials.id, id), eq(materials.organizationId, p.organizationId)),
    )
    .limit(1);
  if (!target) return { error: "教材が見つかりません。" };

  await db
    .update(materials)
    .set({ name, subject, description })
    .where(eq(materials.id, id));

  revalidatePath("/materials");
  redirect("/materials");
}

export async function deleteMaterial(materialId: string) {
  const p = await requireOperator();
  // 割当で使用中の教材は削除不可 (assignments.material_id は restrict)。
  const [used] = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(
      and(
        eq(assignments.materialId, materialId),
        eq(assignments.organizationId, p.organizationId),
      ),
    )
    .limit(1);
  if (used) {
    throw new Error("この教材は課題で使用中のため削除できません。");
  }
  await db
    .delete(materials)
    .where(
      and(
        eq(materials.id, materialId),
        eq(materials.organizationId, p.organizationId),
      ),
    );
  revalidatePath("/materials");
}

/** 教材に課題ファイル(PDF/画像)をアップロードする。 */
export async function uploadMaterialFile(materialId: string, fd: FormData) {
  const p = await requireOperator();
  const [m] = await db
    .select()
    .from(materials)
    .where(
      and(
        eq(materials.id, materialId),
        eq(materials.organizationId, p.organizationId),
      ),
    )
    .limit(1);
  if (!m) throw new Error("教材が見つかりません。");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("ファイルを選択してください。");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("ファイルサイズが大きすぎます (25MBまで)。");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const pathname = `${p.organizationId}/materials/${materialId}/${safeName}`;
  const stored = await saveBlob(pathname, buf, file.type || "application/octet-stream");

  await db.insert(materialFiles).values({
    organizationId: p.organizationId,
    materialId,
    kind: "assignment",
    blobUrl: stored.url,
    pathname: stored.pathname,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  });

  revalidatePath("/materials");
}

// =============================================================================
// 課題割当 (+ 提出物を未提出で作成)
// =============================================================================

export async function createAssignment(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireOperator();
  const studentId = str(fd, "studentId");
  const materialId = str(fd, "materialId");
  const title = str(fd, "title");
  const rangeText = str(fd, "rangeText");
  const instructions = str(fd, "instructions");
  const dueDateRaw = str(fd, "dueDate");
  if (!studentId || !materialId) {
    return { error: "生徒と教材を選択してください。" };
  }

  // org スコープ確認
  const [s] = await db
    .select()
    .from(students)
    .where(
      and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)),
    )
    .limit(1);
  const [m] = await db
    .select()
    .from(materials)
    .where(
      and(eq(materials.id, materialId), eq(materials.organizationId, p.organizationId)),
    )
    .limit(1);
  if (!s || !m) return { error: "生徒または教材が見つかりません。" };

  // 自動進度教材なら初回セッションの範囲をエンジンで算出。手入力なら入力値。
  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.materialId, materialId))
    .orderBy(asc(units.sortOrder));
  const autoRange = initialSessionRange(m, unitRows, 1);
  const sessionRange = autoRange || rangeText;

  await db.transaction(async (tx) => {
    const [assign] = await tx
      .insert(assignments)
      .values({
        organizationId: p.organizationId,
        studentId,
        materialId,
        title: title || m.name,
        rangeText: sessionRange,
        instructions,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        assignedById: p.id,
      })
      .returning();
    await tx.insert(submissions).values({
      organizationId: p.organizationId,
      assignmentId: assign.id,
      studentId,
      status: "not_submitted",
      sessionNo: 1,
      rangeText: sessionRange,
    });
  });

  revalidatePath("/assignments");
  revalidatePath("/dashboard");
  redirect("/assignments");
}

/** マトリクス表の「＋」セルからのインライン割当 (リダイレクトせず再描画のみ)。 */
export async function addAssignment(fd: FormData) {
  const p = await requireOperator();
  const studentId = str(fd, "studentId");
  const materialId = str(fd, "materialId");
  const rangeText = str(fd, "rangeText");
  if (!studentId || !materialId) throw new Error("生徒と教材を選んでください。");

  const [s] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)))
    .limit(1);
  const [m] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.id, materialId), eq(materials.organizationId, p.organizationId)))
    .limit(1);
  if (!s || !m) throw new Error("生徒または教材が見つかりません。");

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.materialId, materialId))
    .orderBy(asc(units.sortOrder));
  const sessionRange = initialSessionRange(m, unitRows, 1) || rangeText;

  await db.transaction(async (tx) => {
    const [assign] = await tx
      .insert(assignments)
      .values({
        organizationId: p.organizationId,
        studentId,
        materialId,
        title: m.name,
        rangeText: sessionRange,
        assignedById: p.id,
      })
      .returning();
    await tx.insert(submissions).values({
      organizationId: p.organizationId,
      assignmentId: assign.id,
      studentId,
      status: "not_submitted",
      sessionNo: 1,
      rangeText: sessionRange,
    });
  });

  revalidatePath("/assignments");
  revalidatePath("/dashboard");
}

/** 割当を削除 (関連する提出物もカスケード削除)。 */
export async function deleteAssignment(assignmentId: string) {
  const p = await requireOperator();
  await db
    .delete(assignments)
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(assignments.organizationId, p.organizationId),
      ),
    );
  revalidatePath("/assignments");
  revalidatePath("/dashboard");
}

// =============================================================================
// ログイン情報の発行 (生徒ID/PIN・保護者パスワード・採点者アカウント)
// =============================================================================

/** 生徒のログインID + PIN を発行/更新する。 */
export async function issueStudentCredentials(studentId: string, fd: FormData) {
  const p = await requireOperator();
  const loginId = str(fd, "loginId");
  const pin = str(fd, "pin");
  if (!loginId) throw new Error("ログインIDを入力してください。");

  const [target] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)))
    .limit(1);
  if (!target) throw new Error("生徒が見つかりません。");

  const [dup] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.loginId, loginId))
    .limit(1);
  if (dup && dup.id !== studentId) {
    throw new Error("そのログインIDは既に使われています。");
  }

  const patch: Partial<typeof students.$inferInsert> = { loginId, active: true };
  if (pin) {
    patch.pinHash = await bcrypt.hash(pin, 10);
    patch.pinPlain = pin;
  }
  await db.update(students).set(patch).where(eq(students.id, studentId));

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

/** 保護者(parent)のパスワードを再発行する。 */
export async function resetGuardianPassword(userId: string, fd?: FormData) {
  const p = await requireOperator();
  // パスワード未指定なら自動生成(ワンクリック再発行)。
  const password = (fd && str(fd, "password")) || randomPassword();

  const [u] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organizationId, p.organizationId),
        eq(users.role, "parent"),
      ),
    )
    .limit(1);
  if (!u) throw new Error("保護者が見つかりません。");

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10), pwPlain: password })
    .where(eq(users.id, userId));
  revalidatePath("/students");
}

/** 保護者を削除する (生徒との紐づけもカスケード削除)。 */
export async function deleteGuardian(userId: string) {
  const p = await requireOperator();
  await db
    .delete(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organizationId, p.organizationId),
        eq(users.role, "parent"),
      ),
    );
  revalidatePath("/students");
}

/** 採点者(operator)アカウントを発行する。管理者のみ。 */
export async function createOperator(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = await requireAdmin();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!name || !email || !password) {
    return { error: "氏名・メール・パスワードをすべて入力してください。" };
  }
  const [dup] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (dup) return { error: "そのメールアドレスは既に登録されています。" };

  await db.insert(users).values({
    organizationId: p.organizationId,
    name,
    email,
    role: "operator",
    passwordHash: await bcrypt.hash(password, 10),
    pwPlain: password,
  });
  revalidatePath("/staff");
  redirect("/staff");
}

/** 採点者・管理者のパスワードを再発行する。管理者のみ。 */
export async function resetStaffPassword(userId: string, fd: FormData) {
  const p = await requireAdmin();
  const password = str(fd, "password");
  if (!password) throw new Error("新しいパスワードを入力してください。");

  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, p.organizationId)))
    .limit(1);
  if (!u || (u.role !== "operator" && u.role !== "admin")) {
    throw new Error("対象のスタッフが見つかりません。");
  }
  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10), pwPlain: password })
    .where(eq(users.id, userId));
  revalidatePath("/staff");
}
