import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOperator } from "@/lib/access";
import { getSubmissionDetail } from "@/lib/queries";
import { PdfAnnotator } from "@/app/(student)/submissions/[submissionId]/pdf-annotator";

export default async function SubmissionWritePage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const p = await requireOperator();
  const detail = await getSubmissionDetail(p.organizationId, submissionId);
  if (!detail) notFound();

  const { submission, assignment, student, material, solutionFiles, returnedFiles, images } = detail;
  if (images.length === 0) notFound();

  return (
    <div className="write-screen">
      <header className="write-bar">
        <Link href={`/grading/${submission.id}`} className="write-back">← 採点詳細へ</Link>
        <div className="write-title">
          {student.name} さんの答案を添削
          <span className="write-range">{material.subject} / {submission.rangeText || assignment.rangeText || material.name}</span>
        </div>
        <div className="write-links">
          {solutionFiles.map((f) => (
            <a key={f.id} href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">
              解答解説
            </a>
          ))}
          {returnedFiles.slice(0, 2).map((f) => (
            <a key={f.id} href={`/api/files/returned/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">
              過去の添削
            </a>
          ))}
        </div>
      </header>
      <div className="write-body">
        <PdfAnnotator
          pdfUrl={`/api/files/submission-pdf/${submission.id}`}
          submissionId={submission.id}
          mode="markup"
          fullBleed
          downloadName={`${student.name}_${submission.rangeText || material.name}_添削`}
          redirectTo={`/grading/${submission.id}`}
        />
      </div>
    </div>
  );
}
