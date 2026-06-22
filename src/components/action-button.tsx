"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type Variant = "default" | "secondary" | "destructive" | "outline" | "ghost";

const CLASS: Record<Variant, string> = {
  default: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-secondary",
  ghost: "btn-secondary",
  destructive: "btn-danger",
};

/**
 * バウンド済みサーバーアクションを呼び出すボタン (PHP風スタイル)。
 * 成功/失敗を toast で通知し、revalidatePath による再描画に任せる。
 */
export function ActionButton({
  action,
  children,
  variant = "default",
  confirm,
  successMessage,
  className,
}: {
  action: () => Promise<unknown>;
  children: React.ReactNode;
  variant?: Variant;
  confirm?: string;
  successMessage?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (confirm && !window.confirm(confirm)) return;
    startTransition(async () => {
      try {
        await action();
        if (successMessage) toast.success(successMessage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "エラーが発生しました。");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`${CLASS[variant]}${className ? " " + className : ""}`}
    >
      {children}
    </button>
  );
}
