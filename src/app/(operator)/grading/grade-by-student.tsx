"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { batchGrade, type BatchGradeItem } from "@/lib/actions/submission-actions";
import type { NextWindow } from "@/lib/progress-db";

export interface AnswerRow {
  submissionId: string;
  materialName: string;
  subject: string;
  rangeText: string;
  sessionNo: number;
  attemptCount: number;
  next: NextWindow | null;
}
export interface StudentGroup {
  studentId: string;
  studentName: string;
  studentGrade: string;
  answers: AnswerRow[];
}

interface CellState { score: string; maxScore: string; pass: boolean; comment: string }
const empty: CellState = { score: "", maxScore: "", pass: false, comment: "" };
interface NextState { startIdx: number; count: number; manual: string }

function labelAt(w: NextWindow, idx: number): string {
  return w.track === "number" ? String(w.numberStart + idx) : (w.labels[idx] ?? "");
}
function joinLabel(a: string, b: string): string {
  if (b === "" || a === b) return a;
  if (a === "") return b;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return `${a}-${b}`;
  return `${a}~${b}`;
}
function renderRange(w: NextWindow, startIdx: number, count: number): string {
  return count <= 1 ? labelAt(w, startIdx) : joinLabel(labelAt(w, startIdx), labelAt(w, startIdx + count - 1));
}

export function GradeByStudent({ groups }: { groups: StudentGroup[] }) {
  // 答案(submissionId)ごとに採点状態を持つ(PHPの列=教材に対応)
  const [state, setState] = useState<Record<string, CellState>>(() => {
    const init: Record<string, CellState> = {};
    for (const g of groups) for (const a of g.answers) init[a.submissionId] = { ...empty };
    return init;
  });
  const [nextState, setNextState] = useState<Record<string, NextState>>(() => {
    const init: Record<string, NextState> = {};
    for (const g of groups) for (const a of g.answers) {
      const w = a.next;
      init[a.submissionId] = w ? { startIdx: w.startIdx, count: w.count, manual: "" } : { startIdx: 0, count: 1, manual: "" };
    }
    return init;
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  if (groups.length === 0) {
    return <p className="empty">採点できる生徒はいません（1日分の課題がそろうと表示されます）。</p>;
  }

  const set = (id: string, patch: Partial<CellState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const setNext = (subId: string, patch: Partial<NextState>) => setNextState((s) => ({ ...s, [subId]: { ...s[subId], ...patch } }));

  function stepRange(subId: string, w: NextWindow, target: "start" | "end", delta: number) {
    setNextState((s) => {
      const cur = s[subId];
      let { startIdx, count } = cur;
      if (target === "start") {
        const endIdx = startIdx + count - 1;
        startIdx = Math.max(0, Math.min(endIdx, startIdx + delta));
        count = endIdx - startIdx + 1;
      } else {
        const endIdx = Math.max(startIdx, Math.min(w.maxIdx, startIdx + count - 1 + delta));
        count = endIdx - startIdx + 1;
      }
      return { ...s, [subId]: { ...cur, startIdx, count } };
    });
  }

  function confirmStudent(g: StudentGroup) {
    const items: BatchGradeItem[] = g.answers.map((a) => {
      const st = state[a.submissionId];
      const pass = st.pass;
      const item: BatchGradeItem = {
        submissionId: a.submissionId,
        score: st.score,
        maxScore: st.maxScore,
        result: pass ? "ok" : "ng",
        comment: st.comment,
        mode: pass ? "return" : "resubmit",
      };
      if (pass && a.next && !a.next.fixed) {
        const ns = nextState[a.submissionId];
        item.next = a.next.track === "manual" ? { label: ns.manual } : { startIdx: ns.startIdx, count: ns.count };
      }
      return item;
    });
    setPendingId(g.studentId);
    startTransition(async () => {
      try {
        const res = await batchGrade(items);
        setSent((s) => ({ ...s, [g.studentId]: true }));
        toast.success(`${g.studentName}さんに結果を返しました（${res.processed}件・生徒に届きました）。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      } finally {
        setPendingId(null);
      }
    });
  }

  // 矢印キーでセル移動(表計算風)。data-gx=列(答案), data-gy=行(項目)。section内に限定。
  function onGridKey(e: React.KeyboardEvent<HTMLElement>) {
    const t = e.target as HTMLElement;
    const gx = t.getAttribute?.("data-gx");
    const gy = t.getAttribute?.("data-gy");
    if (gx == null || gy == null) return;
    const x = Number(gx), y = Number(gy);
    const isCb = t.getAttribute("data-cell-type") === "checkbox";
    const scope = e.currentTarget;
    const focusAt = (nx: number, ny: number) => {
      const el = scope.querySelector<HTMLElement>(`[data-gx="${nx}"][data-gy="${ny}"]`);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement && el.type !== "checkbox") el.select();
        e.preventDefault();
      }
    };
    if (e.key === "ArrowUp") focusAt(x, y - 1);
    else if (e.key === "ArrowDown" || e.key === "Enter") focusAt(x, y + 1);
    else if (e.key === "ArrowLeft" && isCb) focusAt(x - 1, y);
    else if (e.key === "ArrowRight" && isCb) focusAt(x + 1, y);
  }

  return (
    <div className="gstudents">
      <p className="hint" style={{ marginBottom: 12 }}>
        生徒を1人ずつ採点します（採点可能 {groups.length} 名）。各教材の<b>合格</b>にチェック（スペース可）→<b>「結果を返す」</b>で生徒に届きます。チェック無し＝やり直し。矢印キーでセル移動。
      </p>

      {groups.map((g) => {
        const busy = pendingId === g.studentId;
        const isSent = !!sent[g.studentId];
        const passN = g.answers.filter((a) => state[a.submissionId]?.pass).length;
        return (
          <section key={g.studentId} className={`gstudent${isSent ? " is-sent" : ""}`} onKeyDown={onGridKey}>
            <div className="gstudent-head">
              <div>
                <span className="gstudent-name">{g.studentName}</span>
                <span className="gstudent-grade">{g.studentGrade}</span>
                <span className={`status-chip ${isSent ? "ok" : "wait"}`}>{isSent ? "● 返却済み" : "● 未返却"}</span>
                <span className="gstudent-count">答案 {g.answers.length} 件</span>
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <Link href={`/grading/write/${g.studentId}`} className="btn-secondary" style={{ padding: "8px 14px", fontSize: 13 }}>✏️ PDFを開いて添削</Link>
                <a href={`/api/files/student-answers/${g.studentId}?dl=1`} className="btn-secondary" style={{ padding: "8px 12px", fontSize: 13 }}>⬇ ダウンロード</a>
              </div>
            </div>

            {/* PHP風: 列=教材, 行=項目 の添削結果入力 */}
            <div className="roster gsheet">
              <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
                <table className="record-table gsheet-col" style={{ minWidth: 320 + g.answers.length * 200 }}>
                  <thead>
                    <tr>
                      <th className="rowlab">教材</th>
                      {g.answers.map((a) => (
                        <th key={a.submissionId}>
                          {a.materialName}
                          <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{a.subject}{a.attemptCount > 1 ? ` ・ 再提出${a.attemptCount - 1}` : ""}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="rowlab">範囲</td>
                      {g.answers.map((a) => <td key={a.submissionId}><span className="cell-pad">{a.rangeText || "範囲なし"}</span></td>)}
                    </tr>
                    <tr>
                      <td className="rowlab">得点</td>
                      {g.answers.map((a, ci) => (
                        <td key={a.submissionId}><input type="number" step="0.5" inputMode="decimal" value={state[a.submissionId].score} placeholder="点" style={{ textAlign: "center" }} data-gx={ci} data-gy={0} onChange={(e) => set(a.submissionId, { score: e.target.value })} /></td>
                      ))}
                    </tr>
                    <tr>
                      <td className="rowlab">満点</td>
                      {g.answers.map((a, ci) => (
                        <td key={a.submissionId}><input type="number" step="0.5" inputMode="decimal" value={state[a.submissionId].maxScore} placeholder="満点" style={{ textAlign: "center" }} data-gx={ci} data-gy={1} onChange={(e) => set(a.submissionId, { maxScore: e.target.value })} /></td>
                      ))}
                    </tr>
                    <tr>
                      <td className="rowlab">合格</td>
                      {g.answers.map((a, ci) => {
                        const st = state[a.submissionId];
                        return (
                          <td key={a.submissionId} className={st.pass ? "j-ok" : ""}>
                            <label className="pass-check" style={{ justifyContent: "center", width: "100%" }}>
                              <input type="checkbox" checked={st.pass} data-gx={ci} data-gy={2} data-cell-type="checkbox" onChange={(e) => set(a.submissionId, { pass: e.target.checked })} />
                              <span className={st.pass ? "pass-yes" : "pass-no"}>{st.pass ? "合格" : "やり直し"}</span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="rowlab">コメント</td>
                      {g.answers.map((a, ci) => (
                        <td key={a.submissionId}><input type="text" value={state[a.submissionId].comment} placeholder="任意" data-gx={ci} data-gy={3} onChange={(e) => set(a.submissionId, { comment: e.target.value })} /></td>
                      ))}
                    </tr>
                    <tr>
                      <td className="rowlab">次回</td>
                      {g.answers.map((a) => {
                        const w = a.next;
                        const st = state[a.submissionId];
                        if (!w) return <td key={a.submissionId}><span className="muted cell-pad">—</span></td>;
                        const ns = nextState[a.submissionId];
                        return (
                          <td key={a.submissionId}>
                            <div className={`next-cell${st.pass ? "" : " is-off"}`}>
                              {w.fixed ? (
                                <b className="next-fixed">{w.label}</b>
                              ) : w.track === "manual" ? (
                                <input className="next-manual" value={ns.manual} placeholder="次回の範囲" onChange={(e) => setNext(a.submissionId, { manual: e.target.value })} />
                              ) : (
                                <>
                                  <b className="next-val">{renderRange(w, ns.startIdx, ns.count)}</b>
                                  <span className="next-steps">
                                    <span className="next-grp">始
                                      <button type="button" onClick={() => stepRange(a.submissionId, w, "start", -1)}>−</button>
                                      <button type="button" onClick={() => stepRange(a.submissionId, w, "start", 1)}>＋</button>
                                    </span>
                                    <span className="next-grp">終
                                      <button type="button" onClick={() => stepRange(a.submissionId, w, "end", -1)}>−</button>
                                      <button type="button" onClick={() => stepRange(a.submissionId, w, "end", 1)}>＋</button>
                                    </span>
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gstudent-foot">
              <span className="hint">合格 {passN} / {g.answers.length} 件 ・ 「結果を返す」で生徒に届きます（チェック無し＝やり直し）。</span>
              {isSent ? (
                <span className="btn-sent">✓ 返却済み（生徒に届きました）</span>
              ) : (
                <button type="button" className="btn-send big" onClick={() => confirmStudent(g)} disabled={pendingId !== null}>
                  {busy ? "返しています…" : `📨 ${g.studentName}さんに結果を返す`}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
