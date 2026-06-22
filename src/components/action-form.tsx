"use client";

import { useActionState } from "react";

interface FormState {
  error?: string;
}

/**
 * useActionState でサーバーアクションを実行する汎用フォーム (PHP風ボタン)。
 * 入力フィールドは children として渡す。
 */
export function ActionForm({
  action,
  children,
  submitLabel = "保存",
  className = "form-grid",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && <p className="r-NG" style={{ fontSize: 13 }}>{state.error}</p>}
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "処理中..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
