"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  requestResubmit,
  returnGrading,
  saveGradingDraft,
} from "@/lib/actions/submission-actions";
import type { MistakeTag } from "@/db/schema";

export interface GradeDefaults {
  score: string;
  maxScore: string;
  result: "" | "ok" | "ng";
  comment: string;
  nextRange: string;
}

export function GradePanel({
  submissionId,
  mistakeTags,
  defaults,
  autoAdvance,
  hasDraft,
}: {
  submissionId: string;
  mistakeTags: MistakeTag[];
  defaults: GradeDefaults;
  autoAdvance: boolean;
  hasDraft: boolean;
}) {
  const [score, setScore] = useState(defaults.score);
  const [maxScore, setMaxScore] = useState(defaults.maxScore);
  const [result, setResult] = useState<GradeDefaults["result"]>(defaults.result);
  const [comment, setComment] = useState(defaults.comment);
  const [nextRange, setNextRange] = useState(defaults.nextRange);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function buildFd() {
    const fd = new FormData();
    fd.set("score", score);
    fd.set("maxScore", maxScore);
    if (result) fd.set("result", result);
    fd.set("comment", comment);
    fd.set("nextRange", nextRange);
    tags.forEach((t) => fd.append("mistakeTagIds", t));
    return fd;
  }

  function run(
    fn: (id: string, fd: FormData) => Promise<unknown>,
    msg: string,
  ) {
    startTransition(async () => {
      try {
        await fn(submissionId, buildFd());
        toast.success(msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "エラーが発生しました。");
      }
    });
  }

  return (
    <div className="grade-panel">
      <div className="grade-score-row">
        <label className="grade-field">
          <span>得点</span>
          <input type="number" step="0.5" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" />
        </label>
        <span className="grade-slash">/</span>
        <label className="grade-field">
          <span>満点</span>
          <input type="number" step="0.5" inputMode="decimal" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="—" />
        </label>
      </div>

      <div className="grade-block">
        <div className="grade-label">合否</div>
        <div className="radio-group radio-group--lg">
          <span className={`radio ok${result === "ok" ? " is-on" : ""}`} onClick={() => setResult(result === "ok" ? "" : "ok")}>合格</span>
          <span className={`radio ng${result === "ng" ? " is-on" : ""}`} onClick={() => setResult(result === "ng" ? "" : "ng")}>不合格</span>
        </div>
      </div>

      {mistakeTags.length > 0 && (
        <div className="grade-block">
          <div className="grade-label">ミス分類</div>
          <div className="tag-wrap">
            {mistakeTags.map((t) => {
              const on = tags.has(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`tag-chip${on ? " is-on" : ""}`}
                  onClick={() =>
                    setTags((s) => {
                      const n = new Set(s);
                      if (n.has(t.id)) n.delete(t.id); else n.add(t.id);
                      return n;
                    })
                  }
                >
                  <span style={{ background: t.color }} className="tag-dot" />
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grade-block">
        <div className="grade-label">コメント（生徒へのメッセージ）</div>
        <textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="よくできました／ここを直しましょう など" />
      </div>

      <div className="grade-block">
        <div className="grade-label">
          次回の範囲
          {autoAdvance && <span className="muted">（章/番号教材は合格で自動算出）</span>}
        </div>
        <input type="text" value={nextRange} onChange={(e) => setNextRange(e.target.value)} placeholder={autoAdvance ? "自動（手入力で上書き可）" : "例: A-2 (11〜20)"} />
      </div>

      <div className="grade-actions">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(saveGradingDraft, "下書きを保存しました。")}>
          下書き保存（完了）
        </button>
        <button type="button" className="btn-primary big" disabled={pending} onClick={() => run(returnGrading, "返却しました。生徒へお知らせを送信しました。")}>
          返却する
        </button>
        <button type="button" className="btn-danger" disabled={pending} onClick={() => run(requestResubmit, "再提出を依頼しました。")}>
          再提出を依頼
        </button>
      </div>
      {hasDraft && <p className="hint">※ 前回の下書きを読み込みました。</p>}
    </div>
  );
}
