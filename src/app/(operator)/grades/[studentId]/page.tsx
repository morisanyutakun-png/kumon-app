import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { students, subscriptions } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listGradingHistory } from "@/lib/queries";
import { GradeReport } from "@/components/grade-report";
import { StudentSwitcher } from "@/components/student-switcher";

import { AssignPurchasedButton } from "./assign-purchased";

export default async function OperatorStudentGradePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const p = await requireOperator();

  // org スコープで生徒を取得(他orgは notFound)
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)))
    .limit(1);
  if (!student) notFound();

  const [rows, allStudents, subRows] = await Promise.all([
    listGradingHistory(p.organizationId, { studentIds: [studentId] }),
    db
      .select({ id: students.id, name: students.name, grade: students.grade })
      .from(students)
      .where(eq(students.organizationId, p.organizationId))
      .orderBy(asc(students.name)),
    db
      .select({ subjectLabels: subscriptions.subjectLabels, status: subscriptions.status })
      .from(subscriptions)
      .where(and(eq(subscriptions.studentId, studentId), eq(subscriptions.organizationId, p.organizationId)))
      .limit(1),
  ]);
  const sub = subRows[0];

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <Link href="/grades" className="db-badge">← 成績管理</Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <h1 style={{ margin: 0 }}>
            {student.name}
            <span className="muted" style={{ fontSize: 14, fontWeight: 500, marginLeft: 8 }}>{student.grade}</span>
          </h1>
          <StudentSwitcher options={allStudents} current={studentId} base="/grades/" mode="path" />
        </div>
        <p style={{ marginTop: 6 }}>
          <Link href={`/students`} className="muted" style={{ fontSize: 12 }}>生徒・保護者の編集へ</Link>
        </p>
      </div>

      {sub && (
        <section className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>購入科目（申込連携）</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {sub.subjectLabels || "（科目情報なし）"}
              </div>
            </div>
            <AssignPurchasedButton studentId={studentId} />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            ※ 購入科目に対応する教科の教材を一括で割り当てます（既に割り当て済みはスキップ）。該当教材が未登録の場合は、先に教材を登録してください。
          </p>
        </section>
      )}

      <GradeReport rows={rows} />
    </div>
  );
}
