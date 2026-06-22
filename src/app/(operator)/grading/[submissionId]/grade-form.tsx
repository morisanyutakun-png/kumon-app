"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { gradeSubmission } from "@/lib/actions/submission-actions";
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
    <form ref={formRef} className="form-grid">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-row">
          <label htmlFor="score">得点</label>
          <input id="score" name="score" type="number" step="0.5" inputMode="decimal" placeholder="例: 80" />
        </div>
        <div className="form-row">
          <label htmlFor="maxScore">満点</label>
          <input id="maxScore" name="maxScore" type="number" step="0.5" inputMode="decimal" placeholder="例: 100" />
        </div>
      </div>

      <div className="form-row">
        <label>合否</label>
        <span className="radio-group" style={{ alignSelf: "start" }}>
          <span
            className={`radio ok${result === "ok" ? " is-on" : ""}`}
            onClick={() => setResult(result === "ok" ? "" : "ok")}
          >
            合格
          </span>
          <span
            className={`radio ng${result === "ng" ? " is-on" : ""}`}
            onClick={() => setResult(result === "ng" ? "" : "ng")}
          >
            不合格
          </span>
        </span>
      </div>

      {mistakeTags.length > 0 && (
        <div className="form-row">
          <label>ミス分類</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {mistakeTags.map((tag) => (
              <label key={tag.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text)", fontWeight: 400 }}>
                <input type="checkbox" name="mistakeTagIds" value={tag.id} />
                <span style={{ display: "inline-block", height: 10, width: 10, borderRadius: 999, background: tag.color }} />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="form-row">
        <label htmlFor="comment">コメント</label>
        <textarea id="comment" name="comment" rows={4} placeholder="生徒・保護者へのコメントを入力してください。" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => submit("return")}>
          採点結果を返却
        </button>
        <button type="button" className="btn-danger" disabled={pending} onClick={() => submit("resubmit")}>
          再提出を依頼
        </button>
      </div>
    </form>
  );
}
