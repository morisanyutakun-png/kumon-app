"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

interface FormState {
  error?: string;
}

/**
 * useActionState でサーバーアクションを実行する汎用フォーム。
 * 入力フィールドは children として渡す。
 */
export function ActionForm({
  action,
  children,
  submitLabel = "保存",
  className = "space-y-4",
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
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "処理中..." : submitLabel}
      </Button>
    </form>
  );
}
