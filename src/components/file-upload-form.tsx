"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";

/** 単一ファイルをバウンド済みサーバーアクションへアップロードするフォーム。 */
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
    <form ref={formRef} onSubmit={onSubmit} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="file"
        name="file"
        accept={accept}
        required
        style={{ fontSize: 12 }}
      />
      <button type="submit" className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }} disabled={pending}>
        {pending ? "…" : buttonLabel}
      </button>
    </form>
  );
}
