import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listGradingHistory, listSubmissions } from "@/lib/queries";
import { HistoryList } from "@/components/history-list";
import { SubmissionTable } from "@/components/submission-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    .where(
      and(eq(students.id, id), eq(students.organizationId, p.organizationId)),
    )
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
  const passRate =
    gradedCount > 0 ? Math.round((passCount / gradedCount) * 100) : null;

  const stats = [
    { label: "提出物", value: subs.length },
    { label: "完了", value: doneCount },
    { label: "採点回数", value: history.length },
    { label: "合格率", value: passRate === null ? "—" : `${passRate}%` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/students" className="text-sm text-blue-600 hover:underline">
          ← 生徒一覧へ
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{student.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {student.grade || "学年未設定"}
              {student.loginId ? ` ・ ログインID: ${student.loginId}` : ""}
              {!student.active ? " ・ 停止中" : ""}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              保護者:{" "}
              {guardians.length > 0
                ? guardians.map((g) => g.name).join("、")
                : "（未登録）"}
            </p>
          </div>
          <Link
            href={`/students/${student.id}/edit`}
            className="text-sm text-blue-600 hover:underline"
          >
            編集
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="mt-1 text-xs text-slate-500">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">提出履歴</CardTitle>
        </CardHeader>
        <CardContent>
          <SubmissionTable
            rows={subs}
            hrefBase="/grading"
            emptyText="提出物はありません。"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">採点・成績履歴</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryList rows={history} />
        </CardContent>
      </Card>
    </div>
  );
}
