"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { activateAccount, verifySetupToken } from "@/lib/provision";

export interface SetupState {
  error?: string;
}

/**
 * /setup のパスワード設定→本登録→自動ログイン。
 * 1. token を検証(期限内・未使用) … 無効なら再案内
 * 2. 既存方式(bcryptjs)でパスワードをハッシュ化して active 化、token を使用済みに
 * 3. 既存の signIn でそのままログイン状態にしてトップ(/ → /home)へ
 */
export async function completeSetupAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "パスワードは8文字以上にしてください。" };
  }
  if (password !== confirm) {
    return { error: "確認用のパスワードが一致しません。" };
  }

  const ctx = await verifySetupToken(token);
  if (!ctx) {
    return {
      error: "リンクの有効期限が切れているか、すでに使用済みです。お手数ですが、もう一度メールのリンクからお試しください。",
    };
  }

  await activateAccount({ userId: ctx.userId, password, tokenId: ctx.tokenId });

  try {
    await signIn("credentials", { identifier: ctx.email, password, redirectTo: "/" });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      // パスワード設定自体は完了している。
      return { error: "登録は完了しました。ログイン画面からログインしてください。" };
    }
    throw error; // NEXT_REDIRECT は再スロー(=ログイン成功でトップへ)
  }
}
