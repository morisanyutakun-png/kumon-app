"use client";

import { useActionState, useEffect, useState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth-actions";

const initial: LoginState = {};

/** ミニマルなログインフォーム (ラベルは読み上げ用、プレースホルダーで表示)。 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [slow, setSlow] = useState(false);

  // 画面表示時に DB を起こしておく(Neon の自動サスペンド対策)。
  // 入力している数秒のあいだに温まり、送信時のタイムアウト=空回りを防ぐ。
  useEffect(() => {
    fetch("/api/keep-warm", { cache: "no-store" }).catch(() => {});
  }, []);

  // 送信が長引いたら「無言の空回り」にせず、状況を伝える。
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [pending]);

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
      {pending && slow && (
        <p className="auth-help" role="status">
          サーバを起動しています。少し時間がかかることがあります…
          <br />
          そのままお待ちいただくか、もう一度「ログイン」を押してください。
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
