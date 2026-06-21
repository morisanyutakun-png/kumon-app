"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

export interface LoginState {
  error?: string;
}

/** ログイン。成功時は signIn が redirect を throw するのでそのまま伝播させる。 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const kind = String(formData.get("kind") ?? "staff");
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      kind,
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
  await signOut({ redirectTo: "/login" });
}
