"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { batchGrade, type BatchGradeItem } from "@/lib/actions/submission-actions";

export interface BatchRow {
  submissionId: string;
  studentName: string;
  studentGrade: string;
  materialName: string;
  subject: string;
  rangeText: string;
  sessionNo: number;
  attemptCount: number;
  images: { id: string; fileName: string }[];
}

interface ColState {
  score: string;
  maxScore: string;
  result: "" | "ok" | "ng";
  comment: string;
  op: "" | "return" | "resubmit";
}

const empty: ColState = { score: "", maxScore: "", result: "", comment: "", op: "" };

export function BatchGradeTable({ rows }: { rows: BatchRow[] }) {
  const [state, setState] = useState<Record<string, ColState>>(() =>
    Object.fromEntries(rows.map((r) => [r.submissionId, { ...empty }])),
  );
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return <p className="empty">採点待ち(提出済み)の答案はありません。</p>;
  }

  const set = (id: string, patch: Partial<ColState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  function save() {
    const items: BatchGradeItem[] = rows
      .filter((r) => state[r.submissionId]?.op)
      .map((r) => {
        const st = state[r.submissionId];
        return {
          submissionId: r.submissionId,
          score: st.score,
          maxScore: st.maxScore,
          result: st.result,
          comment: st.comment,
          mode: st.op === "resubmit" ? "resubmit" : "return",
        };
      });
    if (items.length === 0) {
      toast.warning("「操作」を選んだ列がありません。");
      return;
    }
    startTransition(async () => {
      try {
        const res = await batchGrade(items);
        toast.success(`${res.processed}件を処理しました。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }

  return (
    <div>
      <div className="mastery-toolbar">
        <div className="toolbar-left">
          <span className="hint">提出済みの答案を列ごとに採点します（採点待ち {rows.length} 件）</span>
        </div>
        <div className="toolbar-right">
          <button type="button" className="btn-primary big" onClick={save} disabled={pending}>
            {pending ? "保存中..." : "入力した列をまとめて返却"}
          </button>
        </div>
      </div>

      <div className="grid-scroll">
        <table className="entry-grid">
          <thead>
            <tr>
              <th className="row-label">添削シート</th>
              {rows.map((r) => (
                <th key={r.submissionId} className="col">
                  <div className="col-head">
                    <span className="col-name">{r.studentName}</span>
                    <span className="col-meta">{r.studentGrade}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 教材・範囲 */}
            <tr className="row-range">
              <td className="row-label">教材 / 範囲</td>
              {rows.map((r) => (
                <td key={r.submissionId} className="col">
                  <div>{r.materialName}</div>
                  <div className="col-meta">
                    {r.subject} / {r.rangeText || "—"} ・ {r.sessionNo}回目
                  </div>
                </td>
              ))}
            </tr>

            {/* 答案 */}
            <tr>
              <td className="row-label">答案</td>
              {rows.map((r) => (
                <td key={r.submissionId} className="col">
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    {r.images.slice(0, 3).map((img) => (
                      <a
                        key={img.id}
                        href={`/api/files/submission/${img.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title={img.fileName}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/submission/${img.id}`}
                          alt={img.fileName}
                          style={{ height: 44, width: 44, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }}
                        />
                      </a>
                    ))}
                    <Link href={`/grading/${r.submissionId}`} className="hint" style={{ color: "var(--primary)" }}>
                      詳細
                    </Link>
                  </div>
                </td>
              ))}
            </tr>

            {/* 得点 */}
            <tr className="row-score">
              <td className="row-label">得点 / 満点</td>
              {rows.map((r) => {
                const st = state[r.submissionId];
                return (
                  <td key={r.submissionId} className="col">
                    <span className="score-pair">
                      <input
                        type="number"
                        step="0.5"
                        inputMode="decimal"
                        value={st.score}
                        onChange={(e) => set(r.submissionId, { score: e.target.value })}
                      />
                      <span className="muted">/</span>
                      <input
                        type="number"
                        step="0.5"
                        inputMode="decimal"
                        value={st.maxScore}
                        onChange={(e) => set(r.submissionId, { maxScore: e.target.value })}
                      />
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* 合否 */}
            <tr>
              <td className="row-label">合否</td>
              {rows.map((r) => {
                const st = state[r.submissionId];
                return (
                  <td key={r.submissionId} className="col">
                    <span className="radio-group">
                      <span
                        className={`radio ok${st.result === "ok" ? " is-on" : ""}`}
                        onClick={() => set(r.submissionId, { result: st.result === "ok" ? "" : "ok" })}
                      >
                        合格
                      </span>
                      <span
                        className={`radio ng${st.result === "ng" ? " is-on" : ""}`}
                        onClick={() => set(r.submissionId, { result: st.result === "ng" ? "" : "ng" })}
                      >
                        不合格
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* コメント */}
            <tr className="row-comment">
              <td className="row-label">コメント</td>
              {rows.map((r) => {
                const st = state[r.submissionId];
                return (
                  <td key={r.submissionId} className="col">
                    <input
                      type="text"
                      value={st.comment}
                      placeholder="コメント"
                      onChange={(e) => set(r.submissionId, { comment: e.target.value })}
                    />
                  </td>
                );
              })}
            </tr>

            {/* 操作 */}
            <tr className="row-op">
              <td className="row-label">操作</td>
              {rows.map((r) => {
                const st = state[r.submissionId];
                return (
                  <td key={r.submissionId} className="col">
                    <select
                      value={st.op}
                      onChange={(e) => set(r.submissionId, { op: e.target.value as ColState["op"] })}
                      style={{
                        height: 34,
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        padding: "0 8px",
                        background: "#fff",
                        font: "inherit",
                      }}
                    >
                      <option value="">—</option>
                      <option value="return">返却</option>
                      <option value="resubmit">再提出依頼</option>
                    </select>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
