"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { DEMO_COOKIE, isDemoMode } from "@/lib/demo";

export interface LoginState {
  error?: string;
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
