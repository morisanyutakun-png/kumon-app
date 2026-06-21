"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * 単一ファイルをバウンド済みサーバーアクションへアップロードするフォーム。
 */
export function FileUploadForm({
  action,
  accept,
  buttonLabel = "アップロード",
  successMessage = "アップロードしました。",
}: {
  action: (fd: FormData) => Promise<unknown>;
  accept?: string;
  buttonLabel?: string;
  successMessage?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await action(fd);
        toast.success(successMessage);
        form.reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "エラーが発生しました。");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="file"
        name="file"
        accept={accept}
        required
        className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "..." : buttonLabel}
      </Button>
    </form>
  );
}
