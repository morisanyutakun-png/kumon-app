"use client";

import { useActionState, useState } from "react";

import { completeSetupAction, type SetupState } from "@/lib/actions/setup-actions";

const initial: SetupState = {};

/** パスワード設定フォーム。メールと契約科目は表示のみ(編集不可)。 */
export function SetupForm({
  token,
  email,
  studentName,
  subjectLabels,
  grade,
}: {
  token: string;
  email: string;
  studentName?: string;
  subjectLabels?: string;
  grade?: string;
}) {
  const [state, formAction, pending] = useActionState(completeSetupAction, initial);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && pw !== confirm;

  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="token" value={token} />

      <div className="setup-info">
        {studentName && (
          <div className="setup-info-row">
            <span className="setup-info-label">お名前</span>
            <span className="setup-info-val">{studentName}{grade ? `（${grade}）` : ""}</span>
          </div>
        )}
        <div className="setup-info-row">
          <span className="setup-info-label">メール</span>
          <span className="setup-info-val">{email}</span>
        </div>
        {subjectLabels && (
          <div className="setup-info-row">
            <span className="setup-info-label">ご契約科目</span>
            <span className="setup-info-val">{subjectLabels}</span>
          </div>
        )}
      </div>

      {/* ログインIDになるメールはブラウザの自動補完用に hidden で添える */}
      <input type="hidden" name="email" value={email} autoComplete="username" />

      <label htmlFor="password" className="sr-only">パスワード（8文字以上）</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="パスワード（8文字以上）"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        minLength={8}
        required
      />

      <label htmlFor="confirm" className="sr-only">パスワード（確認）</label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder="パスワード（確認）"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        minLength={8}
        required
      />

      {tooShort && <p className="auth-help" role="status">パスワードは8文字以上にしてください。</p>}
      {mismatch && <p className="auth-error" role="alert">確認用のパスワードが一致しません。</p>}
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}

      <button
        type="submit"
        className="auth-submit"
        disabled={pending || pw.length < 8 || pw !== confirm}
      >
        {pending ? "設定中…" : "パスワードを設定してはじめる"}
      </button>
    </form>
  );
}
