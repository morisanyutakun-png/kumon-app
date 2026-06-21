"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";
import { Button } from "@/components/ui/button";

export function SubmitForm({
  submissionId,
  resubmit,
}: {
  submissionId: string;
  resubmit?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
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
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">
          答案の写真を選ぶ（複数可）
        </span>
        <input
          type="file"
          name="images"
          accept="image/*"
          capture="environment"
          multiple
          required
          onChange={(e) => setCount(e.currentTarget.files?.length ?? 0)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:text-white"
        />
      </label>
      {count > 0 && (
        <p className="text-xs text-slate-500">{count} 枚 選択中</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "送信中..." : resubmit ? "再提出する" : "提出する"}
      </Button>
    </form>
  );
}
