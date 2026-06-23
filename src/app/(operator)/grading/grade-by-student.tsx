"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
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

interface RowState { score: string; maxScore: string; pass: boolean; comment: string }
const empty: RowState = { score: "", maxScore: "", pass: false, comment: "" };
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(groups.map((g) => [g.studentId, { ...empty }])),
  );
  const [nextState, setNextState] = useState<Record<string, NextState>>(() => {
    const init: Record<string, NextState> = {};
    for (const g of groups) for (const a of g.answers) {
      const w = a.next;
      init[a.submissionId] = w ? { startIdx: w.startIdx, count: w.count, manual: "" } : { startIdx: 0, count: 1, manual: "" };
    }
    return init;
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const passCount = useMemo(() => groups.filter((g) => state[g.studentId]?.pass).length, [groups, state]);

  if (groups.length === 0) {
    return <p className="empty">採点できる生徒はいません（1日分の課題がそろうと表示されます）。</p>;
  }

  const set = (id: string, patch: Partial<RowState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
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

  function itemsFor(gs: StudentGroup[]): BatchGradeItem[] {
    const items: BatchGradeItem[] = [];
    for (const g of gs) {
      const st = state[g.studentId];
      const pass = st.pass;
      for (const a of g.answers) {
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
          if (a.next.track === "manual") item.next = { label: ns.manual };
          else item.next = { startIdx: ns.startIdx, count: ns.count };
        }
        items.push(item);
      }
    }
    return items;
  }

  function confirm(scope: "student" | "all", g?: StudentGroup) {
    const target = scope === "all" ? groups : [g!];
    if (scope === "all") {
      const ng = groups.length - passCount;
      if (ng > 0 && !window.confirm(`チェックの無い ${ng} 名は「やり直し（再提出）」になります。よろしいですか?`)) return;
    }
    const items = itemsFor(target);
    setPendingId(scope === "all" ? "__all__" : g!.studentId);
    startTransition(async () => {
      try {
        const res = await batchGrade(items);
        toast.success(`${res.processed}件を確定しました（合格は次回へ進みます）。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      } finally {
        setPendingId(null);
      }
    });
  }

  // 矢印キーでセル移動(表計算風)。data-gx=列, data-gy=行(生徒index)。
  function onGridKey(e: React.KeyboardEvent) {
    const t = e.target as HTMLElement;
    const gx = t.getAttribute?.("data-gx");
    const gy = t.getAttribute?.("data-gy");
    if (gx == null || gy == null) return;
    const x = Number(gx), y = Number(gy);
    const isCheckbox = t.getAttribute("data-cell-type") === "checkbox";
    const focusAt = (nx: number, ny: number) => {
      const el = wrapRef.current?.querySelector<HTMLElement>(`[data-gx="${nx}"][data-gy="${ny}"]`);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement && el.type !== "checkbox") el.select();
        e.preventDefault();
      }
    };
    if (e.key === "ArrowUp") focusAt(x, y - 1);
    else if (e.key === "ArrowDown" || e.key === "Enter") focusAt(x, y + 1);
    else if (e.key === "ArrowLeft" && isCheckbox) focusAt(x - 1, y);
    else if (e.key === "ArrowRight" && isCheckbox) focusAt(x + 1, y);
  }

  return (
    <div className="gstudents" ref={wrapRef} onKeyDown={onGridKey}>
      <div className="mastery-toolbar" style={{ marginBottom: 12 }}>
        <div className="toolbar-left">
          <span className="hint">採点可能 {groups.length} 名 ・ 合格チェック {passCount} 名（チェック=合格 / 空=やり直し）</span>
        </div>
        <div className="toolbar-right">
          <button type="button" className="btn-primary big" onClick={() => confirm("all")} disabled={pendingId !== null}>
            {pendingId === "__all__" ? "確定中…" : `全員まとめて確定（合格${passCount}）`}
          </button>
        </div>
      </div>

      {groups.map((g, idx) => {
        const st = state[g.studentId];
        const busy = pendingId === g.studentId;
        return (
          <section key={g.studentId} className={`gstudent${st.pass ? " is-ok" : ""}`}>
            <div className="gstudent-head">
              <div>
                <span className="gstudent-name">{g.studentName}</span>
                <span className="gstudent-grade">{g.studentGrade}</span>
                <span className="status-chip ok">● 採点可能</span>
                <span className="gstudent-count">答案 {g.answers.length} 件</span>
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <Link href={`/grading/write/${g.studentId}`} className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}>✏️ PDFを開いて添削</Link>
                <a href={`/api/files/student-answers/${g.studentId}?dl=1`} className="btn-secondary" style={{ padding: "8px 12px", fontSize: 13 }}>⬇ ダウンロード</a>
              </div>
            </div>

            <div className="roster gsheet">
              <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
                <table className="record-table" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>教材・範囲（{g.answers.length}件）</th>
                      <th style={{ width: 80 }}>得点</th>
                      <th style={{ width: 80 }}>満点</th>
                      <th style={{ width: 130 }}>合格</th>
                      <th style={{ width: "30%" }}>コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={st.pass ? "j-ok" : ""}>
                      <td>
                        <span className="cell-pad" style={{ display: "inline-flex", flexDirection: "column", gap: 2, padding: "6px 10px" }}>
                          {g.answers.map((a) => (
                            <span key={a.submissionId} style={{ fontSize: 13 }}>
                              <b>{a.materialName}</b>
                              <span className="muted"> ・ {a.subject} ・ {a.rangeText || "範囲なし"}{a.attemptCount > 1 ? ` ・ 再提出${a.attemptCount - 1}` : ""}</span>
                            </span>
                          ))}
                        </span>
                      </td>
                      <td><input type="number" step="0.5" inputMode="decimal" value={st.score} placeholder="点" style={{ textAlign: "center" }} data-gx="0" data-gy={idx} onChange={(e) => set(g.studentId, { score: e.target.value })} /></td>
                      <td><input type="number" step="0.5" inputMode="decimal" value={st.maxScore} placeholder="満点" style={{ textAlign: "center" }} data-gx="1" data-gy={idx} onChange={(e) => set(g.studentId, { maxScore: e.target.value })} /></td>
                      <td>
                        <label className="pass-check">
                          <input type="checkbox" checked={st.pass} data-gx="2" data-gy={idx} data-cell-type="checkbox" onChange={(e) => set(g.studentId, { pass: e.target.checked })} />
                          <span className={st.pass ? "pass-yes" : "pass-no"}>{st.pass ? "○ 合格" : "× やり直し"}</span>
                        </label>
                      </td>
                      <td><input type="text" value={st.comment} placeholder="ひとことコメント（任意）" data-gx="3" data-gy={idx} onChange={(e) => set(g.studentId, { comment: e.target.value })} /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {st.pass && (
              <div className="next-assign">
                <div className="next-assign-title">次回の割り当て（合格して進みます。±で調整できます）</div>
                {g.answers.map((a) => {
                  const w = a.next;
                  if (!w) return null;
                  const ns = nextState[a.submissionId];
                  return (
                    <div key={a.submissionId} className="next-row">
                      <span className="next-mat">{a.materialName}</span>
                      <span className="next-arrow">→ 次回</span>
                      {w.fixed ? (
                        <b className="next-fixed">{w.label}</b>
                      ) : w.track === "manual" ? (
                        <input className="next-manual" value={ns.manual} placeholder="次回の範囲を入力" onChange={(e) => setNext(a.submissionId, { manual: e.target.value })} />
                      ) : (
                        <span className="next-stepper">
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
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="gstudent-foot">
              <span className="hint">合格にチェックすると {g.answers.length} 件すべてを返却して次回へ進めます（チェック無し＝やり直し）。</span>
              <button type="button" className="btn-primary" onClick={() => confirm("student", g)} disabled={pendingId !== null}>
                {busy ? "確定中…" : `${g.studentName}さんを確定`}
              </button>
            </div>
          </section>
        );
      })}

      <p className="hint" style={{ marginTop: 4 }}>
        合否は<b>チェックボックス</b>（チェック=合格／空=やり直し）。<b>スペース</b>でチェック、<b>矢印キー</b>でセル移動できます。返却後に生徒が結果を確認すると自動で「完了」。
      </p>
    </div>
  );
}
