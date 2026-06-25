"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { DEMO_COOKIE, isDemoMode } from "@/lib/demo";

export interface LoginState {
  error?: string;
}

export interface SignupState {
  error?: string;
}

/**
 * 運営アカウント(教室)の新規登録。新しい組織(テナント)を作り、その管理者(admin)を作成する。
 * 以後この運営アカウントが配下に 添削(operator)・保護者(parent)・生徒 を作成できる。
 * データは organizationId で論理的に分離される(共有DB・共有サーバ運用)。
 */
export async function signUpAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  if (isDemoMode()) {
    return { error: "デモモードでは新規登録できません。" };
  }
  const orgName = String(formData.get("orgName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!orgName || !name || !email || !password) {
    return { error: "教室名・お名前・メール・パスワードをすべて入力してください。" };
  }
  if (password.length < 6) {
    return { error: "パスワードは6文字以上にしてください。" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "メールアドレスの形式が正しくありません。" };
  }

  // メールはログインIDになるため全体で一意。
  const [dup] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (dup) {
    return { error: "そのメールアドレスは既に使われています。" };
  }

  // 新しい組織(テナント)+ 管理者(運営)を作成。
  const [org] = await db.insert(organizations).values({ name: orgName }).returning();
  await db.insert(users).values({
    organizationId: org.id,
    name,
    email,
    role: "admin",
    passwordHash: await bcrypt.hash(password, 10),
  });

  try {
    await signIn("credentials", { identifier: email, password, redirectTo: "/" });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "登録は完了しました。ログイン画面からログインしてください。" };
    }
    throw error; // NEXT_REDIRECT は再スロー
  }
}

/** ログイン。成功時は signIn が redirect を throw するのでそのまま伝播させる。 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      identifier,
      password,
      redirectTo: "/",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "ログイン情報が正しくありません。" };
    }
    throw error; // NEXT_REDIRECT などは再スロー
  }
}

export async function logoutAction() {
  if (isDemoMode()) {
    (await cookies()).delete(DEMO_COOKIE);
    redirect("/login");
  }
  await signOut({ redirectTo: "/login" });
}

/** デモ(ゲスト)入室。選んだロールを cookie に保存してトップへ。 */
export async function enterAsGuest(role: "operator" | "student" | "parent" | "admin") {
  (await cookies()).set(DEMO_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/");
}
