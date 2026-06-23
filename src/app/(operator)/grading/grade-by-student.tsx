"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { batchGrade, type BatchGradeItem } from "@/lib/actions/submission-actions";

export interface AnswerRow {
  submissionId: string;
  materialName: string;
  subject: string;
  rangeText: string;
  sessionNo: number;
  attemptCount: number;
  images: { id: string; fileName: string }[];
}
export interface StudentGroup {
  studentId: string;
  studentName: string;
  studentGrade: string;
  answers: AnswerRow[];
}

type Judge = "" | "ok" | "ng";
interface RowState { score: string; maxScore: string; judge: Judge; comment: string }
const empty: RowState = { score: "", maxScore: "", judge: "", comment: "" };

export function GradeByStudent({ groups }: { groups: StudentGroup[] }) {
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(groups.map((g) => [g.studentId, { ...empty }])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const judgedCount = useMemo(
    () => groups.filter((g) => state[g.studentId]?.judge).length,
    [groups, state],
  );

  if (groups.length === 0) {
    return <p className="empty">採点できる生徒はいません（1日分の課題がそろうと表示されます）。</p>;
  }

  const set = (id: string, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  function itemsFor(gs: StudentGroup[]): BatchGradeItem[] {
    const items: BatchGradeItem[] = [];
    for (const g of gs) {
      const st = state[g.studentId];
      if (!st?.judge) continue;
      // 1人ぶんの判定を、その生徒の全答案へまとめて適用。
      for (const a of g.answers) {
        items.push({
          submissionId: a.submissionId,
          score: st.score,
          maxScore: st.maxScore,
          result: st.judge as "ok" | "ng",
          comment: st.comment,
          mode: st.judge === "ng" ? "resubmit" : "return",
        });
      }
    }
    return items;
  }

  function confirm(scope: "student" | "all", g?: StudentGroup) {
    const target = scope === "all" ? groups : [g!];
    const items = itemsFor(target);
    if (items.length === 0) {
      toast.warning("○ または × の判定を入れてください。");
      return;
    }
    setPendingId(scope === "all" ? "__all__" : g!.studentId);
    startTransition(async () => {
      try {
        const res = await batchGrade(items);
        toast.success(`${res.processed}件を確定しました（合格は進度が1つ進みます）。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="gstudents">
      <div className="mastery-toolbar" style={{ marginBottom: 12 }}>
        <div className="toolbar-left">
          <span className="hint">採点可能 {groups.length} 名 ・ 判定済み {judgedCount} 名</span>
        </div>
        <div className="toolbar-right">
          <button type="button" className="btn-primary big" onClick={() => confirm("all")} disabled={pendingId !== null || judgedCount === 0}>
            {pendingId === "__all__" ? "確定中…" : `全員まとめて確定（${judgedCount}）`}
          </button>
        </div>
      </div>

      {groups.map((g) => {
        const st = state[g.studentId];
        const busy = pendingId === g.studentId;
        const totalImgs = g.answers.reduce((n, a) => n + a.images.length, 0);
        return (
          <section key={g.studentId} className={`gstudent${st.judge === "ok" ? " is-ok" : st.judge === "ng" ? " is-ng" : ""}`}>
            <div className="gstudent-head">
              <div>
                <span className="gstudent-name">{g.studentName}</span>
                <span className="gstudent-grade">{g.studentGrade}</span>
                <span className="status-chip ok">● 採点可能</span>
                <span className="gstudent-count">答案 {g.answers.length} 件</span>
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <a href={`/api/files/student-answers/${g.studentId}`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }}>
                  📄 答案を1つのPDFで開く
                </a>
                <Link href={`/grades/${g.studentId}`} className="db-badge">成績</Link>
              </div>
            </div>

            {/* 全答案を結合して連続表示(1つのまとまりとして見る) */}
            <div className="gstudent-combined">
              {totalImgs === 0 && <span className="muted" style={{ fontSize: 12 }}>画像なし</span>}
              {g.answers.flatMap((a) =>
                a.images.map((img) => (
                  <a key={img.id} href={`/api/files/submission/${img.id}`} target="_blank" rel="noreferrer" title={`${a.materialName} / ${img.fileName}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/submission/${img.id}`} alt={img.fileName} />
                  </a>
                )),
              )}
            </div>

            {/* 添削結果入力(1人=1行にまとめる) */}
            <div className="roster gsheet">
              <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
                <table className="record-table" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>教材・範囲（{g.answers.length}件）</th>
                      <th style={{ width: 80 }}>得点</th>
                      <th style={{ width: 80 }}>満点</th>
                      <th style={{ width: 200 }}>合否</th>
                      <th style={{ width: "30%" }}>コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={st.judge === "ok" ? "j-ok" : st.judge === "ng" ? "j-ng" : ""}>
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
                      <td><input type="number" step="0.5" inputMode="decimal" value={st.score} placeholder="点" style={{ textAlign: "center" }} onChange={(e) => set(g.studentId, { score: e.target.value })} /></td>
                      <td><input type="number" step="0.5" inputMode="decimal" value={st.maxScore} placeholder="満点" style={{ textAlign: "center" }} onChange={(e) => set(g.studentId, { maxScore: e.target.value })} /></td>
                      <td>
                        <span className="judge">
                          <button type="button" className={`judge-btn ok${st.judge === "ok" ? " on" : ""}`} onClick={() => set(g.studentId, { judge: st.judge === "ok" ? "" : "ok" })}>○ 合格</button>
                          <button type="button" className={`judge-btn ng${st.judge === "ng" ? " on" : ""}`} onClick={() => set(g.studentId, { judge: st.judge === "ng" ? "" : "ng" })}>× やり直し</button>
                        </span>
                      </td>
                      <td><input type="text" value={st.comment} placeholder="ひとことコメント（任意）" onChange={(e) => set(g.studentId, { comment: e.target.value })} /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gstudent-foot">
              <span className="hint">この判定は {g.answers.length} 件すべての答案にまとめて反映されます。</span>
              <button type="button" className="btn-primary" onClick={() => confirm("student", g)} disabled={pendingId !== null || !st.judge}>
                {busy ? "確定中…" : `${g.studentName}さんを確定`}
              </button>
            </div>
          </section>
        );
      })}

      <p className="hint" style={{ marginTop: 4 }}>
        <b>○合格</b>＝返却して進度+1 / <b>×やり直し</b>＝再提出依頼。返却後に生徒が結果を確認すると自動で「完了」になります。
      </p>
    </div>
  );
}
