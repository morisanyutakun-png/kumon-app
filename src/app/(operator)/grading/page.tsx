import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { getActiveDivision } from "@/lib/active-division";
import { divisionForGrade } from "@/lib/division";
import { listSubmissions, type SubmissionRow } from "@/lib/queries";
import { GradeByStudent, type StudentGroup } from "./grade-by-student";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

const DONE_LABEL: Record<string, { text: string; cls: string }> = {
  returned: { text: "返却済み", cls: "ok" },
  done: { text: "完了", cls: "done" },
  resubmit_required: { text: "やり直し中", cls: "ng" },
};

interface Agg {
  studentId: string;
  name: string;
  grade: string;
  submitted: SubmissionRow[];
  grading: SubmissionRow[];
  pend: number;
}

function batchQuery(rows: SubmissionRow[]): string {
  const params = new URLSearchParams();
  params.set("ids", rows.map((s) => s.submissionId).join(","));
  return params.toString();
}

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const p = await requireOperator();
  const division = await getActiveDivision();
  const { tab } = await searchParams;
  const view = tab === "done" ? "done" : tab === "markup" ? "markup" : "input";

  if (view === "done") {
    const doneSubs = (await listSubmissions(p.organizationId, {
      statuses: ["returned", "done", "resubmit_required"],
    })).filter((s) => divisionForGrade(s.studentGrade) === division);
    return (
      <div>
        <GradingHead view="done" todoCount={0} />
        <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
          <table className="record-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: "20%" }}>生徒</th>
                <th>教材・範囲</th>
                <th style={{ width: 120 }}>状態</th>
                <th style={{ width: 90 }}>日付</th>
                <th className="right" style={{ width: 80 }}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {doneSubs.map((s) => {
                const lab = DONE_LABEL[s.status] ?? { text: s.status, cls: "" };
                return (
                  <tr key={s.submissionId}>
                    <td style={{ fontWeight: 600 }}>{s.studentName}<span className="muted" style={{ fontWeight: 400 }}> ・ {s.studentGrade}</span></td>
                    <td>{s.materialName}<span className="muted"> ・ {s.rangeText || "範囲なし"}</span></td>
                    <td><span className={`done-badge ${lab.cls}`}>{lab.text}</span></td>
                    <td className="muted">{fmt(s.returnedAt ?? s.updatedAt)}</td>
                    <td className="right"><Link href={`/grading/${s.submissionId}`} className="db-badge">開く</Link></td>
                  </tr>
                );
              })}
              {doneSubs.length === 0 && (
                <tr><td colSpan={5} className="empty">まだ返却した答案はありません。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- 採点待ち: submitted=未処理の添削キュー / grading=PDF取得済み・点数入力待ち ---
  const allSubs = await listSubmissions(p.organizationId);
  const agg = new Map<string, Agg>();
  for (const sub of allSubs) {
    if (divisionForGrade(sub.studentGrade) !== division) continue; // 選択中の部門の生徒のみ
    let g = agg.get(sub.studentId);
    if (!g) {
      g = { studentId: sub.studentId, name: sub.studentName, grade: sub.studentGrade, submitted: [], grading: [], pend: 0 };
      agg.set(sub.studentId, g);
    }
    if (sub.status === "submitted") g.submitted.push(sub);
    else if (sub.status === "grading") g.grading.push(sub);
    else if (sub.status === "not_submitted" || sub.status === "resubmit_required") g.pend++;
    // returned / done はどちらにも数えない
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ja");
  const markupAgg = [...agg.values()].filter((g) => g.submitted.length > 0).sort(byName);
  const inputAgg = [...agg.values()].filter((g) => g.grading.length > 0).sort(byName);
  const inProgress = [...agg.values()].filter((g) => g.submitted.length === 0 && g.grading.length === 0 && g.pend > 0).sort(byName);

  const groups: StudentGroup[] = inputAgg.map((g) => ({
    studentId: g.studentId,
    studentName: g.name,
    studentGrade: g.grade,
    answers: g.grading.map((s) => ({
      submissionId: s.submissionId,
      materialName: s.materialName,
      subject: s.subject,
      rangeText: s.rangeText,
      sessionNo: s.sessionNo,
      attemptCount: s.attemptCount,
      next: null,
    })),
  }));

  if (view === "markup") {
    return (
      <div>
        <GradingHead view="markup" todoCount={markupAgg.length} />

        {markupAgg.length === 0 ? (
          <p className="empty">添削できる新しい答案はありません。</p>
        ) : (
          <div className="batch-student-grid">
            {markupAgg.map((g) => {
              const query = batchQuery(g.submitted);
              const answersUrl = `/api/files/student-answers/${g.studentId}?${query}`;
              const solutionsUrl = `/api/files/student-solutions/${g.studentId}?${query}`;
              return (
              <section key={g.studentId} className="batch-student-card">
                <div className="batch-student-head">
                  <div>
                    <h2>{g.name}</h2>
                    <p>{g.grade} ・ 未処理の提出 {g.submitted.length} 件</p>
                  </div>
                  <a href={`${answersUrl}&dl=1`} className="btn-primary">答案セットを保存</a>
                </div>
                <div className="batch-student-actions">
                  <a href={`${solutionsUrl}&dl=1`} className="db-badge strong">解答セットを保存</a>
                  <a href={answersUrl} target="_blank" rel="noreferrer" className="db-badge">答案セットを確認</a>
                  <a href={solutionsUrl} target="_blank" rel="noreferrer" className="db-badge">解答セットを確認</a>
                  <Link href="/grading?tab=input" className="db-badge">点数入力へ</Link>
                </div>
                <ol className="batch-submission-list">
                  {g.submitted.map((s) => (
                    <li key={s.submissionId}>
                      <Link href={`/grading/${s.submissionId}`}>{s.materialName}</Link>
                      <span>{s.subject} ・ {s.rangeText || "範囲なし"}</span>
                    </li>
                  ))}
                </ol>
              </section>
              );
            })}
          </div>
        )}

        {inProgress.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div className="lsection" style={{ marginBottom: 10 }}>実施中<span className="lsection-n">{inProgress.length}</span></div>
            <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>提出待ちの課題だけが残っている生徒です。提出されると添削タブに表示されます。</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <GradingHead view="input" todoCount={groups.length} />
      <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
        点数入力には、答案セットを保存または確認した提出だけが表示されます。GoodNotesなどで添削したPDFは各生徒欄から取り込めます。
      </p>

      <GradeByStudent groups={groups} grader={p.name} />

      {inProgress.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="lsection" style={{ marginBottom: 10 }}>実施中<span className="lsection-n">{inProgress.length}</span></div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>まだ提出待ちの課題だけが残っている生徒です。提出済み答案は出た時点で上の採点待ちに表示されます。</p>
          <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
            <table className="record-table" style={{ minWidth: 520 }}>
              <thead>
                <tr><th style={{ width: "40%" }}>生徒</th><th>提出ぐあい</th></tr>
              </thead>
              <tbody>
                {inProgress.map((g) => {
                  const total = g.submitted.length + g.grading.length + g.pend;
                  return (
                    <tr key={g.studentId}>
                      <td style={{ fontWeight: 600 }}>{g.name}<span className="muted" style={{ fontWeight: 400 }}> ・ {g.grade}</span><span className="status-chip wait">● 実施中</span></td>
                      <td className="muted">提出 {g.submitted.length + g.grading.length} / {total} ・ のこり {g.pend} 件</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GradingHead({ view, todoCount }: { view: "markup" | "input" | "done"; todoCount: number }) {
  const tabCls = (on: boolean) => (on ? "btn-primary" : "btn-secondary");
  return (
    <>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>採点</h1>
        <p>答案セットと解答セットを保存し、GoodNotesなどで添削したPDFを取り込んでから点数入力・返却を確定します。</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Link href="/grading?tab=markup" className={tabCls(view === "markup")} style={{ padding: "8px 18px" }}>
          添削{view === "markup" && <b style={{ marginLeft: 6 }}>{todoCount}</b>}
        </Link>
        <Link href="/grading?tab=input" className={tabCls(view === "input")} style={{ padding: "8px 18px" }}>
          点数入力・返却{view === "input" && <b style={{ marginLeft: 6 }}>{todoCount}</b>}
        </Link>
        <Link href="/grading?tab=done" className={tabCls(view === "done")} style={{ padding: "8px 18px" }}>
          返却済
        </Link>
      </div>
    </>
  );
}
