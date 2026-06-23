import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { canAccessStudent, requirePrincipal } from "@/lib/access";
import { getSubmissionDetail } from "@/lib/queries";
import { PdfAnnotator } from "../pdf-annotator";

/** 全画面の書き込み演習画面 (生徒が解きやすいよう専用URL・全画面表示)。 */
export default async function WritePage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const p = await requirePrincipal();
  const detail = await getSubmissionDetail(p.organizationId, submissionId);
  if (!detail) notFound();

  const allowed = await canAccessStudent(p, detail.student.id);
  if (!allowed) notFound();

  const { submission, assignment, material, materialFiles } = detail;
  const canSubmit =
    submission.status === "not_submitted" || submission.status === "resubmit_required";

  const pdfFile = materialFiles.find(
    (f) => f.contentType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf"),
  );

  // 書き込み対象が無い / 提出できない状態なら通常画面へ戻す
  if (!pdfFile || !canSubmit) redirect(`/submissions/${submissionId}`);

  const back = `/submissions/${submissionId}`;

  return (
    <div className="write-screen">
      <header className="write-bar">
        <Link href={back} className="write-back">← もどる</Link>
        <div className="write-title">
          {assignment.title || material.name}
          {submission.rangeText ? <span className="write-range">範囲 {submission.rangeText}</span> : null}
        </div>
        <span style={{ width: 70 }} />
      </header>
      <div className="write-body">
        <PdfAnnotator
          pdfUrl={`/api/files/material/${pdfFile.id}`}
          submissionId={submission.id}
          resubmit={submission.status === "resubmit_required"}
          fullBleed
          redirectTo={back}
        />
      </div>
    </div>
  );
}
