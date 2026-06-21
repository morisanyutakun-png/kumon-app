"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { gradeSubmission } from "@/lib/actions/submission-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MistakeTag } from "@/db/schema";

export function GradeForm({
  submissionId,
  mistakeTags,
}: {
  submissionId: string;
  mistakeTags: MistakeTag[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "ng" | "">("");

  function submit(mode: "return" | "resubmit") {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("mode", mode);
    if (result) fd.set("result", result);
    startTransition(async () => {
      try {
        await gradeSubmission(submissionId, fd);
        toast.success(mode === "return" ? "採点結果を返却しました。" : "再提出を依頼しました。");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "エラーが発生しました。");
      }
    });
  }

  return (
    <form ref={formRef} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="score">得点</Label>
          <Input id="score" name="score" type="number" step="0.5" inputMode="decimal" placeholder="例: 80" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxScore">満点</Label>
          <Input id="maxScore" name="maxScore" type="number" step="0.5" inputMode="decimal" placeholder="例: 100" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>合否</Label>
        <div className="flex gap-2">
          {([
            ["ok", "合格"],
            ["ng", "不合格"],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setResult(result === val ? "" : val)}
              className={
                "rounded-md border px-4 py-1.5 text-sm font-medium transition-colors " +
                (result === val
                  ? val === "ok"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-rose-500 bg-rose-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mistakeTags.length > 0 && (
        <div className="space-y-2">
          <Label>ミス分類</Label>
          <div className="flex flex-wrap gap-3">
            {mistakeTags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="mistakeTagIds"
                  value={tag.id}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="comment">コメント</Label>
        <Textarea
          id="comment"
          name="comment"
          rows={4}
          placeholder="生徒・保護者へのコメントを入力してください。"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" disabled={pending} onClick={() => submit("return")}>
          採点結果を返却
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => submit("resubmit")}
        >
          再提出を依頼
        </Button>
      </div>
    </form>
  );
}
