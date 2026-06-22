"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";

export function SubmitForm({
  submissionId,
  resubmit,
}: {
  submissionId: string;
  resubmit?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(0);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await submitAnswer(submissionId, fd);
        toast.success(resubmit ? "再提出しました。" : "提出しました。");
        form.reset();
        setCount(0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "提出に失敗しました。");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>答案の写真を選ぶ（複数可）</span>
        <input
          type="file"
          name="images"
          accept="image/*"
          capture="environment"
          multiple
          required
          onChange={(e) => setCount(e.currentTarget.files?.length ?? 0)}
        />
      </label>
      {count > 0 && <p className="muted" style={{ margin: 0 }}>{count} 枚 選択中</p>}
      <div>
        <button type="submit" className="btn-primary big" disabled={pending}>
          {pending ? "送信中..." : resubmit ? "再提出する" : "提出する"}
        </button>
      </div>
    </form>
  );
}
