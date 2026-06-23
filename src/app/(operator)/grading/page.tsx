import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { assignments, students, submissionImages } from "@/db/schema";
import { requireOperator } from "@/lib/access";
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
  gradable: SubmissionRow[];
  pend: number;
}

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const p = await requireOperator();
  const { tab } = await searchParams;
  const view = tab === "done" ? "done" : "todo";

  if (view === "done") {
    const doneSubs = await listSubmissions(p.organizationId, {
      statuses: ["returned", "done", "resubmit_required"],
    });
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

  // --- 採点待ち: 1日分の割当が全部提出された生徒だけ「採点可能」 ---
  const [assignRows, allSubs] = await Promise.all([
    db
      .select({ aid: assignments.id, studentId: assignments.studentId, name: students.name, grade: students.grade })
      .from(assignments)
      .innerJoin(students, eq(assignments.studentId, students.id))
      .where(and(eq(assignments.organizationId, p.organizationId), eq(assignments.status, "active"))),
    listSubmissions(p.organizationId),
  ]);

  // 割当ごとの最新提出
  const latestByAssign = new Map<string, SubmissionRow>();
  for (const s of allSubs) if (!latestByAssign.has(s.assignmentId)) latestByAssign.set(s.assignmentId, s);

  const agg = new Map<string, Agg>();
  for (const a of assignRows) {
    let g = agg.get(a.studentId);
    if (!g) {
      g = { studentId: a.studentId, name: a.name, grade: a.grade, gradable: [], pend: 0 };
      agg.set(a.studentId, g);
    }
    const sub = latestByAssign.get(a.aid);
    const st = sub?.status;
    if (st === "submitted" || st === "grading") g.gradable.push(sub!);
    else if (!sub || st === "not_submitted" || st === "resubmit_required") g.pend++;
    // returned / done(前サイクル) はどちらにも数えない
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ja");
  const readyAgg = [...agg.values()].filter((g) => g.gradable.length > 0 && g.pend === 0).sort(byName);
  const inProgress = [...agg.values()].filter((g) => g.gradable.length > 0 && g.pend > 0).sort(byName);

  // 採点可能な答案の画像
  const gradableIds = readyAgg.flatMap((g) => g.gradable.map((s) => s.submissionId));
  const imgs =
    gradableIds.length > 0
      ? await db
          .select()
          .from(submissionImages)
          .where(inArray(submissionImages.submissionId, gradableIds))
          .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder))
      : [];
  const imagesFor = (subId: string) => {
    const all = imgs.filter((i) => i.submissionId === subId);
    const latest = all.reduce((m, i) => Math.max(m, i.attemptNo), 0);
    return all.filter((i) => i.attemptNo === latest).map((i) => ({ id: i.id, fileName: i.fileName }));
  };

  const groups: StudentGroup[] = readyAgg.map((g) => ({
    studentId: g.studentId,
    studentName: g.name,
    studentGrade: g.grade,
    answers: g.gradable.map((s) => ({
      submissionId: s.submissionId,
      materialName: s.materialName,
      subject: s.subject,
      rangeText: s.rangeText,
      sessionNo: s.sessionNo,
      attemptCount: s.attemptCount,
      images: imagesFor(s.submissionId),
    })),
  }));

  return (
    <div>
      <GradingHead view="todo" todoCount={groups.length} />

      <GradeByStudent groups={groups} />

      {inProgress.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="lsection" style={{ marginBottom: 10 }}>実施中<span className="lsection-n">{inProgress.length}</span></div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>まだ全部の課題を提出していない生徒です。1日分がそろうと採点できます。</p>
          <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
            <table className="record-table" style={{ minWidth: 520 }}>
              <thead>
                <tr><th style={{ width: "40%" }}>生徒</th><th>提出ぐあい</th></tr>
              </thead>
              <tbody>
                {inProgress.map((g) => {
                  const total = g.gradable.length + g.pend;
                  return (
                    <tr key={g.studentId}>
                      <td style={{ fontWeight: 600 }}>{g.name}<span className="muted" style={{ fontWeight: 400 }}> ・ {g.grade}</span><span className="status-chip wait">● 実施中</span></td>
                      <td className="muted">提出 {g.gradable.length} / {total} ・ のこり {g.pend} 件</td>
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

function GradingHead({ view, todoCount }: { view: "todo" | "done"; todoCount: number }) {
  const tabCls = (on: boolean) => (on ? "btn-primary" : "btn-secondary");
  return (
    <>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>採点</h1>
        <p>1日分の課題がそろった生徒を「採点可能」に表示。答案は1つのPDFにまとめて、生徒ごとに ○合格 / ×やり直し を付けて確定します。</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Link href="/grading" className={tabCls(view === "todo")} style={{ padding: "8px 18px" }}>
          採点待ち{view === "todo" && <b style={{ marginLeft: 6 }}>{todoCount}</b>}
        </Link>
        <Link href="/grading?tab=done" className={tabCls(view === "done")} style={{ padding: "8px 18px" }}>
          返却済
        </Link>
      </div>
    </>
  );
}
