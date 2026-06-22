"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth-actions";

const initial: LoginState = {};

/** ミニマルなログインフォーム (ラベルは読み上げ用、プレースホルダーで表示)。 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="auth-form">
      <label htmlFor="identifier" className="sr-only">メールアドレス または ログインID</label>
      <input
        id="identifier"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="メールアドレス または ログインID"
        required
      />

      <label htmlFor="password" className="sr-only">パスワード</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="パスワード"
        required
      />

      {state.error && <p className="auth-error" role="alert">{state.error}</p>}

      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
