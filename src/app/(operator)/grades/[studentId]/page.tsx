import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listGradingHistory } from "@/lib/queries";
import { GradeReport } from "@/components/grade-report";
import { StudentSwitcher } from "@/components/student-switcher";

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

  const [rows, allStudents] = await Promise.all([
    listGradingHistory(p.organizationId, { studentIds: [studentId] }),
    db
      .select({ id: students.id, name: students.name, grade: students.grade })
      .from(students)
      .where(eq(students.organizationId, p.organizationId))
      .orderBy(asc(students.name)),
  ]);

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

      <GradeReport rows={rows} />
    </div>
  );
}
