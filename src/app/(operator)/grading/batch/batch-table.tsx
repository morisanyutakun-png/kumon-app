"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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

/** 判定: ○=合格(返却・進度+1) / ×=やり直し(再提出依頼) / 空=未判定。 */
type Judge = "" | "ok" | "ng";
interface RowState {
  score: string;
  maxScore: string;
  judge: Judge;
  comment: string;
}
const empty: RowState = { score: "", maxScore: "", judge: "", comment: "" };

export function BatchGradeTable({ rows }: { rows: BatchRow[] }) {
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.submissionId, { ...empty }])),
  );
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    let ok = 0, ng = 0;
    for (const r of rows) {
      const j = state[r.submissionId]?.judge;
      if (j === "ok") ok++;
      else if (j === "ng") ng++;
    }
    return { ok, ng, total: ok + ng };
  }, [state, rows]);

  if (rows.length === 0) {
    return <p className="empty">採点待ち(提出済み)の答案はありません。</p>;
  }

  const set = (id: string, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  function save() {
    const items: BatchGradeItem[] = rows
      .filter((r) => state[r.submissionId]?.judge)
      .map((r) => {
        const st = state[r.submissionId];
        return {
          submissionId: r.submissionId,
          score: st.score,
          maxScore: st.maxScore,
          result: st.judge as "ok" | "ng",
          comment: st.comment,
          mode: st.judge === "ng" ? "resubmit" : "return",
        };
      });
    if (items.length === 0) {
      toast.warning("○ または × の判定を入れた行がありません。");
      return;
    }
    startTransition(async () => {
      try {
        const res = await batchGrade(items);
        toast.success(`${res.processed}件を確定しました（合格は進度が1つ進みます）。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }

  return (
    <div className="roster gsheet">
      <div className="mastery-toolbar" style={{ marginBottom: 10 }}>
        <div className="toolbar-left">
          <span className="hint">
            採点待ち {rows.length} 件 ・ 判定済み <b style={{ color: "#0e9f6e" }}>○{counts.ok}</b> / <b style={{ color: "#e11d48" }}>×{counts.ng}</b>
          </span>
        </div>
        <div className="toolbar-right">
          <button type="button" className="btn-primary big" onClick={save} disabled={pending || counts.total === 0}>
            {pending ? "確定中…" : `判定した ${counts.total} 件を確定`}
          </button>
        </div>
      </div>

      <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
        <table className="record-table" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ width: "13%" }}>生徒</th>
              <th style={{ width: 64 }}>学年</th>
              <th style={{ width: "20%" }}>教材・範囲</th>
              <th style={{ width: 150 }}>答案</th>
              <th style={{ width: 130 }}>得点 / 満点</th>
              <th style={{ width: 190 }}>判定</th>
              <th>コメント</th>
              <th className="right" style={{ width: 70 }}>詳細</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = state[r.submissionId];
              return (
                <tr key={r.submissionId} className={st.judge === "ok" ? "j-ok" : st.judge === "ng" ? "j-ng" : ""}>
                  <td><span className="cell-pad" style={{ fontWeight: 700 }}>{r.studentName}</span></td>
                  <td><span className="cell-pad">{r.studentGrade || "—"}</span></td>
                  <td>
                    <span className="cell-pad" style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.3, padding: "4px 10px" }}>
                      <span style={{ fontWeight: 600 }}>{r.materialName}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {r.subject} ・ {r.rangeText || "範囲なし"}{r.sessionNo > 1 ? ` ・ ${r.sessionNo}回目` : ""}{r.attemptCount > 1 ? ` ・ 再提出${r.attemptCount - 1}` : ""}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "3px 8px" }}>
                      {r.images.slice(0, 3).map((img) => (
                        <a key={img.id} href={`/api/files/submission/${img.id}`} target="_blank" rel="noreferrer" title={img.fileName}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/submission/${img.id}`} alt={img.fileName} style={{ height: 34, width: 34, objectFit: "cover", border: "1px solid var(--line)" }} />
                        </a>
                      ))}
                      {r.images.length === 0 && <span className="muted" style={{ fontSize: 12 }}>なし</span>}
                    </span>
                  </td>
                  <td>
                    <span className="score-cell">
                      <input type="number" step="0.5" inputMode="decimal" value={st.score} placeholder="得点" onChange={(e) => set(r.submissionId, { score: e.target.value })} />
                      <span className="muted">/</span>
                      <input type="number" step="0.5" inputMode="decimal" value={st.maxScore} placeholder="満点" onChange={(e) => set(r.submissionId, { maxScore: e.target.value })} />
                    </span>
                  </td>
                  <td>
                    <span className="judge">
                      <button type="button" className={`judge-btn ok${st.judge === "ok" ? " on" : ""}`} onClick={() => set(r.submissionId, { judge: st.judge === "ok" ? "" : "ok" })}>○ 合格</button>
                      <button type="button" className={`judge-btn ng${st.judge === "ng" ? " on" : ""}`} onClick={() => set(r.submissionId, { judge: st.judge === "ng" ? "" : "ng" })}>× やり直し</button>
                    </span>
                  </td>
                  <td>
                    <input type="text" value={st.comment} placeholder="ひとことコメント（任意）" onChange={(e) => set(r.submissionId, { comment: e.target.value })} />
                  </td>
                  <td className="right">
                    <Link href={`/grading/${r.submissionId}`} className="db-badge">開く</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        各行に <b>○合格</b> か <b>×やり直し</b> を付け、得点（任意）とコメントを入れて「確定」。
        <b>○</b>=返却して学習進度が1つ進む / <b>×</b>=再提出をお願いする、です。返却後に生徒が結果を確認すると自動で「完了」になります。
      </p>
    </div>
  );
}
