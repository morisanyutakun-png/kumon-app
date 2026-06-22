"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth-actions";

const initial: LoginState = {};

/** 全アカウント共通のログインフォーム (ID + パスワード)。 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="login-form">
      <div className="login-field">
        <label htmlFor="identifier">ID</label>
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="メールアドレス または ログインID"
          required
        />
        <span className="login-hint">先生・保護者はメール、お子さまはログインID</span>
      </div>

      <div className="login-field">
        <label htmlFor="password">パスワード</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="パスワード または あいことば"
          required
        />
      </div>

      {state.error && <p className="login-error" role="alert">{state.error}</p>}

      <button type="submit" className="btn-primary login-submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
