"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { batchGrade, type BatchGradeItem } from "@/lib/actions/submission-actions";
import { divisionForGrade, DIVISION_LABEL } from "@/lib/division";
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

/**
 * 1 答案ぶんの採点状態。判定は PHP 添削結果入力表の導出を踏襲:
 *   未実施/課題なし → SKIP(進度を進めない) / 合格 → OK / それ以外(再テスト含む) → NG(やり直し)
 */
interface Cell {
  range: string;
  skip: boolean;
  score: string;
  maxScore: string;
  pass: boolean;
  retest: boolean;
  noAssign: boolean;
  newMat: boolean;
  remark: string;
}
const emptyCell: Cell = {
  range: "",
  skip: false,
  score: "",
  maxScore: "",
  pass: false,
  retest: false,
  noAssign: false,
  newMat: false,
  remark: "",
};
interface NextState { startIdx: number; count: number; manual: string }

type Judge = "ok" | "ng" | "skip";
function judgeOf(c: Cell): Judge {
  if (c.skip || c.noAssign) return "skip";
  if (c.pass) return "ok";
  return "ng";
}

/** 教科 → アクセント色 (PHPの subject-accent と同値)。 */
const SUBJECT_ACCENT: Record<string, string> = {
  英語: "#ec4899",
  数学: "#2563eb",
  算数: "#2563eb",
  国語: "#ef4444",
  理科: "#16a34a",
  社会: "#eab308",
  情報: "#7c3aed",
  プログラミング: "#7c3aed",
};
const subjectAccent = (s: string) => SUBJECT_ACCENT[s] ?? "#64748b";

function trackBadge(w: NextWindow | null): string {
  if (!w) return "手入力";
  if (w.track === "number") return "番号";
  if (w.track === "manual") return "手入力";
  return "章";
}

function accuracyPct(score: string, maxScore: string): number | null {
  const s = Number(score.trim());
  const m = Number(maxScore.trim());
  if (score.trim() === "" || maxScore.trim() === "") return null;
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;
  return Math.round((s / m) * 1000) / 10;
}
function rowError(c: Cell): string | null {
  if (c.skip || c.noAssign) return null;
  const s = c.score.trim();
  const m = c.maxScore.trim();
  if (s === "" && m === "") return null;
  if (s !== "" && m === "") return "満点も入力してください";
  if (m !== "" && !(Number(m) > 0)) return "満点は0より大きく";
  if (s !== "" && !(Number(s) >= 0)) return "得点は0以上";
  if (s !== "" && m !== "" && Number(s) > Number(m)) return "得点が満点を超えています";
  return null;
}

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

/** 入力日(今日) / 次回テスト日(翌営業日・日曜スキップ)。 */
function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
}
function nextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // 日曜はスキップ
  return d.toLocaleDateString("sv-SE");
}

export function GradeByStudent({ groups, grader }: { groups: StudentGroup[]; grader: string }) {
  const [state, setState] = useState<Record<string, Cell>>(() => {
    const init: Record<string, Cell> = {};
    for (const g of groups) for (const a of g.answers) init[a.submissionId] = { ...emptyCell, range: a.rangeText };
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

  const set = (id: string, patch: Partial<Cell>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
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

  function clearDraft(g: StudentGroup) {
    setState((s) => {
      const next = { ...s };
      for (const a of g.answers) next[a.submissionId] = { ...emptyCell, range: a.rangeText };
      return next;
    });
    toast.info("下書きをクリアしました。");
  }

  function reflect(g: StudentGroup) {
    const bad = g.answers.find((a) => rowError(state[a.submissionId]));
    if (bad) {
      toast.error(`「${bad.materialName}」: ${rowError(state[bad.submissionId])}`);
      return;
    }
    const items: BatchGradeItem[] = g.answers.map((a) => {
      const c = state[a.submissionId];
      const judge = judgeOf(c);
      const notes = [
        c.remark.trim(),
        c.noAssign ? "※課題なし" : "",
        c.newMat ? "※新教材" : "",
        c.retest && judge === "ng" ? "※再テスト" : "",
      ].filter(Boolean).join(" ");
      const item: BatchGradeItem = {
        submissionId: a.submissionId,
        score: c.score,
        maxScore: c.maxScore,
        result: judge,
        comment: notes,
        mode: judge === "ng" ? "resubmit" : "return",
      };
      if (judge === "ok" && a.next && !a.next.fixed) {
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
        toast.success(`${g.studentName}さんに反映しました（${res.processed}件）。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "反映に失敗しました。");
      } finally {
        setPendingId(null);
      }
    });
  }

  // 矢印キーでセル移動。data-gx=列, data-gy=行。
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
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && isCb) focusAt(x + (e.key === "ArrowRight" ? 1 : -1), y);
  }

  return (
    <div className="gstudents entry-grade">
      <p className="hint" style={{ marginBottom: 12 }}>
        生徒ごとに「添削結果入力表」で採点します（採点可能 {groups.length} 名）。各教材に <b>合格</b> / <b>未実施</b> / <b>再テスト</b> をチェック（スペース可）、得点を入れると<b>正答率</b>を自動計算。<b>「結果を反映」</b>で生徒に届きます。矢印キーでセル移動。
      </p>

      {groups.map((g) => {
        const busy = pendingId === g.studentId;
        const isSent = !!sent[g.studentId];
        const n = g.answers.length;
        const errN = g.answers.filter((a) => rowError(state[a.submissionId])).length;
        const gridStyle = { gridTemplateColumns: `108px repeat(${n}, minmax(172px, 1fr))` } as React.CSSProperties;

        // 行を順に描く: 各行 = ラベル + 列セル
        return (
          <section key={g.studentId} className={`gstudent${isSent ? " is-sent" : ""}`} onKeyDown={onGridKey}>
            {/* ===== ツールバー(PHP entry-student-toolbar 相当) ===== */}
            <div className="mastery-toolbar entry-student-toolbar">
              <div className="toolbar-left">
                <span className="toolbar-field">生徒
                  <span className="stu-name">{g.studentName}{g.studentGrade ? ` / ${g.studentGrade}` : ""}</span>
                  <span className={`division-badge ${divisionForGrade(g.studentGrade)}`}>
                    {DIVISION_LABEL[divisionForGrade(g.studentGrade)]}
                  </span>
                </span>
                <span className="metric-chip">{n} 教材</span>
                <span className="toolbar-field">入力日
                  <input type="date" value={todayStr()} readOnly />
                </span>
                <span className="toolbar-field">次回テスト日
                  <input type="date" value={nextBusinessDay()} readOnly title="入力日の翌営業日(日曜はスキップ)" />
                </span>
                <span className="toolbar-field instructor-field">添削者<span className="required-mark">*</span>
                  <span className="stu-name">{grader}</span>
                </span>
              </div>
              <div className="toolbar-right" style={{ gap: 8 }}>
                <span className={`status-chip ${isSent ? "done" : "ok"}`}>{isSent ? "● 反映済み" : "● 未反映"}</span>
                {isSent ? (
                  <span className="btn-sent">✓ 反映済み</span>
                ) : (
                  <>
                    <button type="button" className="btn-primary reflect-btn" onClick={() => reflect(g)} disabled={pendingId !== null || errN > 0}>
                      {busy ? "反映中…" : "結果を反映"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => clearDraft(g)}>下書きをクリア</button>
                  </>
                )}
              </div>
            </div>

            {/* ===== 添削結果入力表(列=教材 / 行=項目) ===== */}
            <div className="mastery-sheet-wrap">
              <div className="mastery-sheet" style={gridStyle}>
                {/* 教材ヘッダー */}
                <div className="sheet-row-label row-name">教材</div>
                {g.answers.map((a) => {
                  const accent = subjectAccent(a.subject);
                  return (
                    <div key={a.submissionId} className="sheet-cell material-head" style={{ borderTop: `3px solid ${accent}` }}>
                      <div className="material-head-top">
                        <span className="subject-pill" style={{ background: accent, color: "#fff" }}>{a.subject || "教科"}</span>
                      </div>
                      <div className="material-name" title={a.materialName}>{a.materialName}</div>
                      <div className="material-meta-line">
                        <span className="track-chip">{trackBadge(a.next)}</span>
                        <small className="muted">{a.sessionNo}回目{a.attemptCount > 1 ? ` ・再提出${a.attemptCount - 1}` : ""}</small>
                      </div>
                      <div className="material-pace">
                        <small className="material-pace-current">
                          {a.next && a.next.track !== "manual" ? `ペース ${a.next.count}${a.next.track === "number" ? "番" : "章"}ずつ` : "手入力"}
                        </small>
                      </div>
                    </div>
                  );
                })}

                {/* 範囲1 */}
                <div className="sheet-row-label" data-row-label="review">範囲1</div>
                {g.answers.map((a) => {
                  const c = state[a.submissionId];
                  const editable = a.next?.track === "manual";
                  return (
                    <div key={a.submissionId} className="sheet-cell range-cell" data-sheet-row="review">
                      {editable ? (
                        <input type="text" value={c.range} placeholder="範囲" onChange={(e) => set(a.submissionId, { range: e.target.value })} />
                      ) : (
                        <span className="range-text">{c.range || "範囲なし"}</span>
                      )}
                    </div>
                  );
                })}

                {/* 範囲1 未実施 */}
                <div className="sheet-row-label" data-row-label="review-skip">範囲1 未実施</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell check-cell" data-sheet-row="review-skip" data-on={c.skip}>
                      <label className="single-check">
                        <input type="checkbox" checked={c.skip} data-gx={ci} data-gy={5} data-cell-type="checkbox" onChange={(e) => set(a.submissionId, { skip: e.target.checked, pass: false, retest: false })} />
                        <span>未実施</span>
                      </label>
                    </div>
                  );
                })}

                {/* 範囲1 得点 */}
                <div className="sheet-row-label" data-row-label="review-score">範囲1 得点</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className={`sheet-cell score-cell${rowError(c) ? " is-required-missing" : ""}`} data-sheet-row="review-score">
                      <input type="number" step="0.5" inputMode="decimal" value={c.score} placeholder="点" disabled={c.skip || c.noAssign} data-gx={ci} data-gy={1} onChange={(e) => set(a.submissionId, { score: e.target.value })} />
                    </div>
                  );
                })}

                {/* 範囲1 満点 */}
                <div className="sheet-row-label" data-row-label="review-max-score">範囲1 満点</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  const needMax = !c.skip && !c.noAssign && c.score.trim() !== "" && c.maxScore.trim() === "";
                  return (
                    <div key={a.submissionId} className={`sheet-cell score-cell${rowError(c) ? " is-required-missing" : ""}`} data-sheet-row="review-max-score">
                      <input type="number" step="0.5" inputMode="decimal" value={c.maxScore} placeholder="満点" disabled={c.skip || c.noAssign} className={needMax ? "need-fill" : ""} data-gx={ci} data-gy={2} onChange={(e) => set(a.submissionId, { maxScore: e.target.value })} />
                    </div>
                  );
                })}

                {/* 範囲1 正答率(読み取り) */}
                <div className="sheet-row-label" data-row-label="review-max-score">正答率</div>
                {g.answers.map((a) => {
                  const c = state[a.submissionId];
                  const acc = accuracyPct(c.score, c.maxScore);
                  return (
                    <div key={a.submissionId} className="sheet-cell rate-cell" data-sheet-row="review-score">
                      {c.skip || c.noAssign || acc === null ? <span className="muted">—</span> : (
                        <b style={{ color: acc >= 80 ? "#0e9f6e" : acc >= 60 ? "#b45309" : "#e11d48" }}>{acc}%</b>
                      )}
                    </div>
                  );
                })}

                {/* 範囲1 合否 */}
                <div className="sheet-row-label" data-row-label="review-pass">範囲1 合否</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell check-cell" data-sheet-row="review-pass" data-on={c.pass}>
                      <label className="single-check">
                        <input type="checkbox" checked={c.pass} disabled={c.skip || c.noAssign} data-gx={ci} data-gy={3} data-cell-type="checkbox" onChange={(e) => set(a.submissionId, { pass: e.target.checked, retest: false, skip: false })} />
                        <span>合格</span>
                      </label>
                    </div>
                  );
                })}

                {/* 範囲1 再テスト */}
                <div className="sheet-row-label" data-row-label="review-retest">範囲1 再テスト</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell check-cell" data-sheet-row="review-retest" data-on={c.retest}>
                      <label className="single-check">
                        <input type="checkbox" checked={c.retest} disabled={c.skip || c.noAssign} data-gx={ci} data-gy={4} data-cell-type="checkbox" onChange={(e) => set(a.submissionId, { retest: e.target.checked, pass: false })} />
                        <span>再テスト</span>
                      </label>
                    </div>
                  );
                })}

                {/* 次回範囲1 */}
                <div className="sheet-row-label" data-row-label="next1">次回範囲1</div>
                {g.answers.map((a) => {
                  const w = a.next;
                  const c = state[a.submissionId];
                  const isPass = judgeOf(c) === "ok";
                  if (!w) return <div key={a.submissionId} className="sheet-cell next-preview-cell"><span className="muted">—</span></div>;
                  const ns = nextState[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell next-preview-cell" data-sheet-row="next1">
                      <div className={`next-cell${isPass ? "" : " is-off"}`}>
                        {w.fixed ? (
                          <b className="next-val">{w.label}</b>
                        ) : w.track === "manual" ? (
                          <input className="next-manual" value={ns.manual} placeholder="次回の範囲" onChange={(e) => setNext(a.submissionId, { manual: e.target.value })} />
                        ) : (
                          <>
                            <b className="next-val">{renderRange(w, ns.startIdx, ns.count)}</b>
                            <span className="next-steps">
                              <span className="next-grp">始<button type="button" onClick={() => stepRange(a.submissionId, w, "start", -1)}>−</button><button type="button" onClick={() => stepRange(a.submissionId, w, "start", 1)}>＋</button></span>
                              <span className="next-grp">終<button type="button" onClick={() => stepRange(a.submissionId, w, "end", -1)}>−</button><button type="button" onClick={() => stepRange(a.submissionId, w, "end", 1)}>＋</button></span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 課題なし */}
                <div className="sheet-row-label" data-row-label="no-assignment">課題なし</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell check-cell" data-sheet-row="no-assignment" data-on={c.noAssign}>
                      <label className="single-check">
                        <input type="checkbox" checked={c.noAssign} data-gx={ci} data-gy={6} data-cell-type="checkbox" onChange={(e) => set(a.submissionId, { noAssign: e.target.checked, pass: false, retest: false })} />
                        <span>課題なし</span>
                      </label>
                    </div>
                  );
                })}

                {/* 新教材 */}
                <div className="sheet-row-label" data-row-label="new-material">新教材</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell check-cell" data-sheet-row="new-material" data-on={c.newMat}>
                      <label className="single-check">
                        <input type="checkbox" checked={c.newMat} data-gx={ci} data-gy={7} data-cell-type="checkbox" onChange={(e) => set(a.submissionId, { newMat: e.target.checked })} />
                        <span>新教材</span>
                      </label>
                    </div>
                  );
                })}

                {/* 備考 */}
                <div className="sheet-row-label" data-row-label="remark">備考</div>
                {g.answers.map((a, ci) => {
                  const c = state[a.submissionId];
                  return (
                    <div key={a.submissionId} className="sheet-cell remark-cell" data-sheet-row="remark">
                      <input type="text" value={c.remark} placeholder="備考(次回課題に ※追記)" data-gx={ci} data-gy={8} onChange={(e) => set(a.submissionId, { remark: e.target.value })} />
                    </div>
                  );
                })}
              </div>
            </div>

            {errN > 0 && (
              <p className="hint" style={{ marginTop: 6 }}><b style={{ color: "#e11d48" }}>入力エラー {errN} 件</b>: 得点・満点を見直してください。</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
