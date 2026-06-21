/**
 * セッション取得とアクセス制御。
 *
 * 原則:
 *   - すべての業務クエリは principal.organizationId でフィルタする (テナント分離)。
 *   - 生徒・保護者は「自分が閲覧できる生徒」に限ってデータへアクセスできる。
 *   - 答案画像などの個人データは canAccessStudent() を必ず通す。
 */
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { Principal } from "@/auth";
import { db } from "@/db";
import { guardianStudents } from "@/db/schema";
import type { UserRole } from "@/db/schema";
import { DEMO_COOKIE, demoPrincipal, isDemoMode } from "@/lib/demo";

export async function getPrincipal(): Promise<Principal | null> {
  // デモモード: ログイン不要。cookie のロールから principal を作る (未選択なら null)。
  if (isDemoMode()) {
    const role = (await cookies()).get(DEMO_COOKIE)?.value;
    return role ? demoPrincipal(role) : null;
  }

  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
    organizationId: session.user.organizationId,
    studentId: session.user.studentId,
  };
}

/** ログイン必須。未ログインなら /login へ。 */
export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  return p;
}

/** 指定ロールのいずれかを必須に。満たさなければ /login (または権限なし)。 */
export async function requireRole(...roles: UserRole[]): Promise<Principal> {
  const p = await requirePrincipal();
  if (!roles.includes(p.role)) redirect("/");
  return p;
}

/** 管理者・運営者(採点者)のみ。 */
export function requireOperator(): Promise<Principal> {
  return requireRole("admin", "operator");
}

/** 管理者のみ。 */
export function requireAdmin(): Promise<Principal> {
  return requireRole("admin");
}

export function isOperator(p: Principal): boolean {
  return p.role === "admin" || p.role === "operator";
}

/**
 * principal が閲覧できる生徒 ID 一覧。
 *   - operator/admin: 同 org の全生徒 (空配列を返し、呼び出し側で org 全体とみなす)
 *   - student: 自分のみ
 *   - parent: 紐づく生徒
 * operator は "*" を返す (全生徒許可の意)。
 */
export async function accessibleStudentIds(
  p: Principal,
): Promise<"*" | string[]> {
  if (isOperator(p)) return "*";
  if (p.role === "student") return p.studentId ? [p.studentId] : [];
  // parent
  const links = await db
    .select({ studentId: guardianStudents.studentId })
    .from(guardianStudents)
    .where(
      and(
        eq(guardianStudents.organizationId, p.organizationId),
        eq(guardianStudents.guardianUserId, p.id),
      ),
    );
  return links.map((l) => l.studentId);
}

/** principal がその生徒のデータにアクセスできるか。 */
export async function canAccessStudent(
  p: Principal,
  studentId: string,
): Promise<boolean> {
  const ids = await accessibleStudentIds(p);
  if (ids === "*") return true;
  return ids.includes(studentId);
}
