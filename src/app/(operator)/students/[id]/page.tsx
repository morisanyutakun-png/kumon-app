import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listGradingHistory, listSubmissions } from "@/lib/queries";
import { HistoryList } from "@/components/history-list";
import { StudentCredentialForm } from "@/components/credential-forms";
import { SubmissionTable } from "@/components/submission-table";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await requireOperator();

  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.organizationId, p.organizationId)))
    .limit(1);
  if (!student) notFound();

  const [guardians, subs, history] = await Promise.all([
    db
      .select({ name: users.name, email: users.email })
      .from(guardianStudents)
      .innerJoin(users, eq(guardianStudents.guardianUserId, users.id))
      .where(eq(guardianStudents.studentId, id))
      .orderBy(asc(users.name)),
    listSubmissions(p.organizationId, { studentIds: [id] }),
    listGradingHistory(p.organizationId, { studentIds: [id] }),
  ]);

  const doneCount = subs.filter((s) => s.status === "done").length;
  const passCount = history.filter((h) => h.result === "ok").length;
  const gradedCount = history.filter((h) => h.result !== null).length;
  const passRate = gradedCount > 0 ? Math.round((passCount / gradedCount) * 100) : null;

  const stats = [
    { label: "提出物", value: subs.length },
    { label: "完了", value: doneCount },
    { label: "採点回数", value: history.length },
    { label: "合格率", value: passRate === null ? "—" : `${passRate}%` },
  ];

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <Link href="/students" className="db-badge">← 生徒一覧へ</Link>
          <h1 style={{ marginTop: 8 }}>
            {student.name}
            {!student.active && (
              <span className="badge" style={{ marginLeft: 8, background: "#f1f5f9", color: "#64748b" }}>停止中</span>
            )}
          </h1>
          <p>
            {student.grade || "学年未設定"}
            {student.loginId ? ` ・ ログインID: ${student.loginId}` : " ・ ログイン未発行"}
            ／ 保護者: {guardians.length > 0 ? guardians.map((g) => g.name).join("、") : "（未登録）"}
          </p>
        </div>
        <Link href={`/students/${student.id}/edit`} className="db-badge">基本情報を編集</Link>
      </div>

      <div className="dashboard">
        {stats.map((s) => (
          <div key={s.label} className="tile" style={{ cursor: "default" }}>
            <div className="tile-num">{s.value}</div>
            <div className="tile-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>ログイン情報の発行</h2>
        <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          メールを持たないお子さま向けの「ログインID」と「PIN（あいことば）」を発行します。
          発行した内容はこの場で控えて、本人・保護者にお渡しください。
        </p>
        <StudentCredentialForm
          studentId={student.id}
          currentLoginId={student.loginId ?? ""}
          hasPin={student.pinHash != null}
        />
      </div>

      <div className="card">
        <h2>提出履歴</h2>
        <SubmissionTable rows={subs} hrefBase="/grading" emptyText="提出物はありません。" />
      </div>

      <div className="card">
        <h2>採点・成績履歴</h2>
        <HistoryList rows={history} />
      </div>
    </div>
  );
}
