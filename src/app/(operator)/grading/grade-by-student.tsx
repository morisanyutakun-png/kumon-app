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
  const allIds = useMemo(
    () => groups.flatMap((g) => g.answers.map((a) => a.submissionId)),
    [groups],
  );
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(allIds.map((id) => [id, { ...empty }])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (groups.length === 0) {
    return <p className="empty">採点待ち（提出済み）の答案はありません。</p>;
  }

  const set = (id: string, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  function judgedItems(ids: string[]): BatchGradeItem[] {
    return ids
      .filter((id) => state[id]?.judge)
      .map((id) => {
        const st = state[id];
        return {
          submissionId: id,
          score: st.score,
          maxScore: st.maxScore,
          result: st.judge as "ok" | "ng",
          comment: st.comment,
          mode: st.judge === "ng" ? "resubmit" : "return",
        };
      });
  }

  function confirm(scope: "student" | "all", g?: StudentGroup) {
    const ids = scope === "all" ? allIds : g!.answers.map((a) => a.submissionId);
    const items = judgedItems(ids);
    if (items.length === 0) {
      toast.warning("○ または × の判定を入れた行がありません。");
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

  const totalJudged = allIds.filter((id) => state[id]?.judge).length;

  return (
    <div className="gstudents">
      <div className="mastery-toolbar" style={{ marginBottom: 12 }}>
        <div className="toolbar-left">
          <span className="hint">生徒 {groups.length} 名 ・ 答案 {allIds.length} 件 ・ 判定済み {totalJudged} 件</span>
        </div>
        <div className="toolbar-right">
          <button type="button" className="btn-primary big" onClick={() => confirm("all")} disabled={pendingId !== null || totalJudged === 0}>
            {pendingId === "__all__" ? "確定中…" : `全員まとめて確定（${totalJudged}）`}
          </button>
        </div>
      </div>

      {groups.map((g) => {
        const ids = g.answers.map((a) => a.submissionId);
        const ok = ids.filter((id) => state[id]?.judge === "ok").length;
        const ng = ids.filter((id) => state[id]?.judge === "ng").length;
        const busy = pendingId === g.studentId;
        return (
          <section key={g.studentId} className="gstudent">
            <div className="gstudent-head">
              <div>
                <span className="gstudent-name">{g.studentName}</span>
                <span className="gstudent-grade">{g.studentGrade}</span>
                <span className="gstudent-count">答案 {g.answers.length} 件</span>
              </div>
              <Link href={`/grades/${g.studentId}`} className="db-badge">この生徒の成績</Link>
            </div>

            {/* まとめて見る: この生徒の答案プレビュー */}
            <div className="gstudent-previews">
              {g.answers.map((a) => (
                <div key={a.submissionId} className="gpv">
                  <div className="gpv-cap">{a.materialName}<span className="muted"> ・ {a.rangeText || "範囲なし"}</span></div>
                  <div className="gpv-imgs">
                    {a.images.length === 0 && <span className="muted" style={{ fontSize: 12 }}>画像なし</span>}
                    {a.images.map((img) => (
                      <a key={img.id} href={`/api/files/submission/${img.id}`} target="_blank" rel="noreferrer" title={img.fileName}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/submission/${img.id}`} alt={img.fileName} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 添削結果入力テーブル(PHPの添削結果入力に倣う) */}
            <div className="roster gsheet">
              <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
                <table className="record-table" style={{ minWidth: 880 }}>
                  <thead>
                    <tr>
                      <th style={{ width: "26%" }}>教材</th>
                      <th style={{ width: 130 }}>範囲</th>
                      <th style={{ width: 80 }}>得点</th>
                      <th style={{ width: 80 }}>満点</th>
                      <th style={{ width: 200 }}>合否</th>
                      <th>コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.answers.map((a) => {
                      const st = state[a.submissionId];
                      return (
                        <tr key={a.submissionId} className={st.judge === "ok" ? "j-ok" : st.judge === "ng" ? "j-ng" : ""}>
                          <td>
                            <span className="cell-pad" style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.3, padding: "4px 10px" }}>
                              <span style={{ fontWeight: 600 }}>{a.materialName}</span>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {a.subject}{a.sessionNo > 1 ? ` ・ ${a.sessionNo}回目` : ""}{a.attemptCount > 1 ? ` ・ 再提出${a.attemptCount - 1}` : ""}
                              </span>
                            </span>
                          </td>
                          <td><span className="cell-pad">{a.rangeText || "—"}</span></td>
                          <td><input type="number" step="0.5" inputMode="decimal" value={st.score} placeholder="点" style={{ textAlign: "center" }} onChange={(e) => set(a.submissionId, { score: e.target.value })} /></td>
                          <td><input type="number" step="0.5" inputMode="decimal" value={st.maxScore} placeholder="満点" style={{ textAlign: "center" }} onChange={(e) => set(a.submissionId, { maxScore: e.target.value })} /></td>
                          <td>
                            <span className="judge">
                              <button type="button" className={`judge-btn ok${st.judge === "ok" ? " on" : ""}`} onClick={() => set(a.submissionId, { judge: st.judge === "ok" ? "" : "ok" })}>○ 合格</button>
                              <button type="button" className={`judge-btn ng${st.judge === "ng" ? " on" : ""}`} onClick={() => set(a.submissionId, { judge: st.judge === "ng" ? "" : "ng" })}>× やり直し</button>
                            </span>
                          </td>
                          <td><input type="text" value={st.comment} placeholder="ひとことコメント（任意）" onChange={(e) => set(a.submissionId, { comment: e.target.value })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gstudent-foot">
              <span className="hint">判定 <b style={{ color: "#0e9f6e" }}>○{ok}</b> / <b style={{ color: "#e11d48" }}>×{ng}</b></span>
              <button type="button" className="btn-primary" onClick={() => confirm("student", g)} disabled={pendingId !== null || ok + ng === 0}>
                {busy ? "確定中…" : `${g.studentName}さんの ${ok + ng} 件を確定`}
              </button>
            </div>
          </section>
        );
      })}

      <p className="hint" style={{ marginTop: 4 }}>
        各行に <b>○合格</b>（返却・進度+1）か <b>×やり直し</b>（再提出依頼）を付け、得点・コメントを入れて「確定」。返却後に生徒が結果を確認すると自動で「完了」になります。
      </p>
    </div>
  );
}
