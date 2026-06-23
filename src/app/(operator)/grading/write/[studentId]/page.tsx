import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { PdfAnnotator } from "@/app/(student)/submissions/[submissionId]/pdf-annotator";

/** 採点者が、生徒の答案(結合PDF)に Apple Pencil 等で添削できる全画面ページ。 */
export default async function GradingWritePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const p = await requireOperator();

  const [student] = await db
    .select({ name: students.name, grade: students.grade })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)))
    .limit(1);
  if (!student) notFound();

  return (
    <div className="write-screen">
      <header className="write-bar">
        <Link href="/grading" className="write-back">← 採点へ</Link>
        <div className="write-title">{student.name} さんの答案を添削<span className="write-range">{student.grade}</span></div>
        <span style={{ width: 70 }} />
      </header>
      <div className="write-body">
        <PdfAnnotator
          pdfUrl={`/api/files/student-answers/${studentId}`}
          mode="markup"
          fullBleed
          downloadName={`${student.name}_添削`}
        />
      </div>
    </div>
  );
}
