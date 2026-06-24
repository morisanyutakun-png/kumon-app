"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
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

/**
 * 判定 (PHP 添削結果入力表の入力仕様を移植):
 *   ok   = 合格 → 返却・進度+1
 *   ng   = やり直し → 再提出依頼
 *   skip = 未実施 → 返却するが進度は進めず、得点も持たない
 *   ""   = 未判定 (確定対象外)
 */
type Judge = "" | "ok" | "ng" | "skip";
interface RowState {
  score: string;
  maxScore: string;
  judge: Judge;
  comment: string;
}
const empty: RowState = { score: "", maxScore: "", judge: "", comment: "" };

/** 正答率 (%) を返す。算出できなければ null。 */
function accuracyPct(score: string, maxScore: string): number | null {
  const s = Number(score.trim());
  const m = Number(maxScore.trim());
  if (score.trim() === "" || maxScore.trim() === "") return null;
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;
  return Math.round((s / m) * 1000) / 10;
}

/** 行ごとの入力エラー (得点を入れたら満点必須・得点≤満点・満点>0)。 */
function rowError(st: RowState): string | null {
  if (st.judge === "skip" || st.judge === "") return null;
  const s = st.score.trim();
  const m = st.maxScore.trim();
  if (s === "" && m === "") return null;
  if (s !== "" && m === "") return "満点も入力してください";
  if (m !== "" && (!(Number(m) > 0) || !Number.isFinite(Number(m))))
    return "満点は0より大きく";
  if (s !== "" && (Number(s) < 0 || !Number.isFinite(Number(s))))
    return "得点は0以上";
  if (s !== "" && m !== "" && Number(s) > Number(m)) return "得点が満点超過";
  return null;
}

export function BatchGradeTable({ rows }: { rows: BatchRow[] }) {
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.submissionId, { ...empty }])),
  );
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLTableElement>(null);

  const counts = useMemo(() => {
    let ok = 0, ng = 0, skip = 0;
    for (const r of rows) {
      const j = state[r.submissionId]?.judge;
      if (j === "ok") ok++;
      else if (j === "ng") ng++;
      else if (j === "skip") skip++;
    }
    return { ok, ng, skip, total: ok + ng + skip };
  }, [state, rows]);

  const errors = useMemo(
    () => rows.filter((r) => rowError(state[r.submissionId])).length,
    [state, rows],
  );

  if (rows.length === 0) {
    return <p className="empty">採点待ち(提出済み)の答案はありません。</p>;
  }

  const set = (id: string, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  /** スプレッドシート風キー操作: ↑↓ で同じ列を移動、Enter で次行へ。 */
  function onKeyNav(e: React.KeyboardEvent<HTMLInputElement>) {
    const key = e.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter") return;
    const grid = gridRef.current;
    if (!grid) return;
    const inputs = Array.from(
      grid.querySelectorAll<HTMLInputElement>(
        `input[data-col="${e.currentTarget.dataset.col}"]`,
      ),
    );
    const idx = inputs.indexOf(e.currentTarget);
    if (idx < 0) return;
    const nextIdx = key === "ArrowUp" ? idx - 1 : idx + 1;
    const next = inputs[nextIdx];
    if (next) {
      e.preventDefault();
      next.focus();
      next.select();
    }
  }

  function save() {
    if (errors > 0) {
      toast.error(`入力エラーが ${errors} 件あります。得点と満点を見直してください。`);
      return;
    }
    const items: BatchGradeItem[] = rows
      .filter((r) => state[r.submissionId]?.judge)
      .map((r) => {
        const st = state[r.submissionId];
        return {
          submissionId: r.submissionId,
          score: st.score,
          maxScore: st.maxScore,
          result: st.judge as "ok" | "ng" | "skip",
          comment: st.comment,
          mode: st.judge === "ng" ? "resubmit" : "return",
        };
      });
    if (items.length === 0) {
      toast.warning("○合格・×やり直し・未実施 のいずれかを入れた行がありません。");
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
            採点待ち {rows.length} 件 ・ 判定済み{" "}
            <b style={{ color: "#0e9f6e" }}>○{counts.ok}</b> /{" "}
            <b style={{ color: "#e11d48" }}>×{counts.ng}</b> /{" "}
            <b style={{ color: "#2563eb" }}>未{counts.skip}</b>
            {errors > 0 && (
              <b style={{ color: "#e11d48", marginLeft: 8 }}>・入力エラー {errors}</b>
            )}
          </span>
        </div>
        <div className="toolbar-right">
          <button
            type="button"
            className="btn-primary big"
            onClick={save}
            disabled={pending || counts.total === 0 || errors > 0}
          >
            {pending ? "確定中…" : `判定した ${counts.total} 件を確定`}
          </button>
        </div>
      </div>

      <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
        <table ref={gridRef} className="record-table" style={{ minWidth: 1160 }}>
          <thead>
            <tr>
              <th style={{ width: "12%" }}>生徒</th>
              <th style={{ width: 56 }}>学年</th>
              <th style={{ width: "18%" }}>教材・範囲</th>
              <th style={{ width: 120 }}>答案</th>
              <th style={{ width: 130 }}>得点 / 満点</th>
              <th style={{ width: 64 }}>正答率</th>
              <th style={{ width: 230 }}>判定</th>
              <th>コメント</th>
              <th className="right" style={{ width: 60 }}>詳細</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = state[r.submissionId];
              const err = rowError(st);
              const acc = accuracyPct(st.score, st.maxScore);
              const rowCls =
                st.judge === "ok"
                  ? "j-ok"
                  : st.judge === "ng"
                    ? "j-ng"
                    : st.judge === "skip"
                      ? "j-skip"
                      : "";
              const needMax =
                st.judge !== "skip" && st.score.trim() !== "" && st.maxScore.trim() === "";
              return (
                <tr key={r.submissionId} className={rowCls}>
                  <td>
                    <span className="cell-pad" style={{ fontWeight: 700 }}>
                      {r.studentName}
                    </span>
                  </td>
                  <td>
                    <span className="cell-pad">{r.studentGrade || "—"}</span>
                  </td>
                  <td>
                    <span
                      className="cell-pad"
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        lineHeight: 1.3,
                        padding: "4px 10px",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{r.materialName}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {r.subject} ・ {r.rangeText || "範囲なし"}
                        {r.sessionNo > 1 ? ` ・ ${r.sessionNo}回目` : ""}
                        {r.attemptCount > 1 ? ` ・ 再提出${r.attemptCount - 1}` : ""}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                        padding: "3px 8px",
                      }}
                    >
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
                            style={{
                              height: 34,
                              width: 34,
                              objectFit: "cover",
                              border: "1px solid var(--line)",
                            }}
                          />
                        </a>
                      ))}
                      {r.images.length === 0 && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          なし
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`score-cell${err ? " is-required-missing" : ""}`}
                      title={err ?? ""}
                    >
                      <input
                        type="number"
                        step="0.5"
                        inputMode="decimal"
                        data-col="score"
                        value={st.score}
                        placeholder="得点"
                        disabled={st.judge === "skip"}
                        onKeyDown={onKeyNav}
                        onChange={(e) => set(r.submissionId, { score: e.target.value })}
                      />
                      <span className="muted">/</span>
                      <input
                        type="number"
                        step="0.5"
                        inputMode="decimal"
                        data-col="maxScore"
                        value={st.maxScore}
                        placeholder="満点"
                        disabled={st.judge === "skip"}
                        className={needMax ? "need-fill" : ""}
                        onKeyDown={onKeyNav}
                        onChange={(e) => set(r.submissionId, { maxScore: e.target.value })}
                      />
                    </span>
                    {err && (
                      <span
                        className="muted"
                        style={{ display: "block", fontSize: 11, color: "#e11d48", paddingLeft: 8 }}
                      >
                        {err}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {acc === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <b style={{ color: acc >= 80 ? "#0e9f6e" : acc >= 60 ? "#b45309" : "#e11d48" }}>
                        {acc}%
                      </b>
                    )}
                  </td>
                  <td>
                    <span className="judge">
                      <button
                        type="button"
                        className={`judge-btn ok${st.judge === "ok" ? " on" : ""}`}
                        onClick={() =>
                          set(r.submissionId, { judge: st.judge === "ok" ? "" : "ok" })
                        }
                      >
                        ○ 合格
                      </button>
                      <button
                        type="button"
                        className={`judge-btn ng${st.judge === "ng" ? " on" : ""}`}
                        onClick={() =>
                          set(r.submissionId, { judge: st.judge === "ng" ? "" : "ng" })
                        }
                      >
                        × やり直し
                      </button>
                      <button
                        type="button"
                        className={`judge-btn skip${st.judge === "skip" ? " on" : ""}`}
                        onClick={() =>
                          set(r.submissionId, {
                            judge: st.judge === "skip" ? "" : "skip",
                          })
                        }
                      >
                        未実施
                      </button>
                    </span>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={st.comment}
                      placeholder="ひとことコメント（任意）"
                      onChange={(e) => set(r.submissionId, { comment: e.target.value })}
                    />
                  </td>
                  <td className="right">
                    <Link href={`/grading/${r.submissionId}`} className="db-badge">
                      開く
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        各行に <b>○合格</b> / <b>×やり直し</b> / <b>未実施</b> を付け、得点（任意・入れたら満点も必須）とコメントを入れて「確定」。
        <b>○</b>=返却して学習進度が1つ進む / <b>×</b>=再提出をお願いする / <b>未実施</b>=今回は記録だけして進度は進めません。
        得点を入れると正答率を自動計算します。↑↓キーで同じ列を移動できます。
      </p>
    </div>
  );
}
