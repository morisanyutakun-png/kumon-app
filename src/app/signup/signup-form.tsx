"use client";

import { useActionState } from "react";

import { signUpAction, type SignupState } from "@/lib/actions/auth-actions";

const initial: SignupState = {};

/** 運営アカウント(教室)の新規登録フォーム。 */
export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initial);

  return (
    <form action={formAction} className="auth-form">
      <label htmlFor="orgName" className="sr-only">教室名・塾名</label>
      <input id="orgName" name="orgName" placeholder="教室名・塾名（例：さくら学習教室）" required />

      <label htmlFor="name" className="sr-only">お名前（運営者）</label>
      <input id="name" name="name" placeholder="お名前（運営者）" required />

      <label htmlFor="email" className="sr-only">メールアドレス</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="メールアドレス（ログインID）"
        required
      />

      <label htmlFor="password" className="sr-only">パスワード</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="パスワード（6文字以上）"
        minLength={6}
        required
      />

      {state.error && <p className="auth-error" role="alert">{state.error}</p>}

      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? "登録中…" : "運営アカウントを作成"}
      </button>
    </form>
  );
}
