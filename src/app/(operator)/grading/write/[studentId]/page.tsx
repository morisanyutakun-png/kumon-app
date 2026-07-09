import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listStudentGradableSubmissions } from "@/lib/pdf-bundles";
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
  const rows = await listStudentGradableSubmissions(p.organizationId, studentId);
  if (rows.length === 0) notFound();

  return (
    <div className="write-screen">
      <header className="write-bar">
        <Link href="/grading?tab=markup" className="write-back">← 一括添削へ</Link>
        <div className="write-title">
          {student.name} さんの一括添削
          <span className="write-range">{student.grade} / {rows.length} 件</span>
        </div>
        <div className="write-links">
          <a href={`/api/files/student-answers/${studentId}`} target="_blank" rel="noreferrer" className="db-badge">提出PDF</a>
          <a href={`/api/files/student-solutions/${studentId}`} target="_blank" rel="noreferrer" className="db-badge">解答解説まとめ</a>
        </div>
      </header>
      <div className="batch-marking-strip">
        {rows.map((r, i) => (
          <Link key={r.submissionId} href={`/grading/${r.submissionId}`} className="batch-marking-chip">
            <b>{i + 1}</b>
            <span>{r.materialName}</span>
            <small>{r.rangeText || `${r.sessionNo}回目`}</small>
          </Link>
        ))}
      </div>
      <div className="write-body">
        <PdfAnnotator
          pdfUrl={`/api/files/student-answers/${studentId}`}
          mode="markup"
          fullBleed
          downloadName={`${student.name}_添削`}
          batchStudentId={studentId}
          redirectTo="/grading?tab=input"
        />
      </div>
    </div>
  );
}
