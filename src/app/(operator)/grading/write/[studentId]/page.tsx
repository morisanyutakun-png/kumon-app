import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listStudentGradableSubmissions } from "@/lib/pdf-bundles";
import { saveStudentReturnedPdf } from "@/lib/actions/submission-actions";
import { PdfAnnotator } from "@/app/(student)/submissions/[submissionId]/pdf-annotator";

/** 採点者が、生徒の答案(結合PDF)に Apple Pencil 等で添削できる全画面ページ。 */
export default async function GradingWritePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { studentId } = await params;
  const { ids: idsParam } = await searchParams;
  const p = await requireOperator();
  const submissionIds = idsParam?.split(",").map((s) => s.trim()).filter(Boolean);

  const [student] = await db
    .select({ name: students.name, grade: students.grade })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, p.organizationId)))
    .limit(1);
  if (!student) notFound();
  const rows = await listStudentGradableSubmissions(p.organizationId, studentId, {
    statuses: submissionIds?.length ? ["submitted", "grading"] : ["submitted"],
    submissionIds,
  });
  if (rows.length === 0) notFound();
  const fixedIds = rows.map((r) => r.submissionId);
  const bundleSearch = new URLSearchParams();
  bundleSearch.set("ids", fixedIds.join(","));
  const bundleQuery = bundleSearch.toString();
  const answersUrl = `/api/files/student-answers/${studentId}?${bundleQuery}`;
  const solutionsUrl = `/api/files/student-solutions/${studentId}?${bundleQuery}`;

  return (
    <div className="write-screen">
      <header className="write-bar">
        <Link href="/grading?tab=markup" className="write-back">← 一括添削へ</Link>
        <div className="write-title">
          {student.name} さんの一括添削
          <span className="write-range">{student.grade} / {rows.length} 件</span>
        </div>
        <div className="write-links">
          <a href={answersUrl} target="_blank" rel="noreferrer" className="db-badge">提出PDF</a>
          <a href={`${answersUrl}&dl=1`} className="db-badge">ダウンロード</a>
          <a href={solutionsUrl} target="_blank" rel="noreferrer" className="db-badge">解答解説まとめ</a>
          <form action={saveStudentReturnedPdf.bind(null, studentId)} className="batch-return-upload">
            <input type="hidden" name="submissionIds" value={fixedIds.join(",")} />
            <label>
              添削済みPDF
              <input type="file" name="file" accept="application/pdf,.pdf" required />
            </label>
            <button type="submit" className="db-badge">取り込む</button>
          </form>
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
          pdfUrl={answersUrl}
          mode="markup"
          fullBleed
          downloadName={`${student.name}_添削`}
          penOnly
          batchStudentId={studentId}
          batchSubmissionIds={fixedIds}
          redirectTo="/grading?tab=input"
        />
      </div>
    </div>
  );
}
