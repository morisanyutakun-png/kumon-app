import Link from "next/link";
import { notFound } from "next/navigation";

import { canAccessStudent, requirePrincipal } from "@/lib/access";
import { getSubmissionDetail } from "@/lib/queries";
import { confirmReturned } from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { GradingHistory } from "@/components/grading-history";
import { MarkRead } from "@/components/mark-read";
import { StatusBadge } from "@/components/status-badge";
import { SubmitPanel } from "./submit-panel";

export default async function StudentSubmissionPage({
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

  const { submission, assignment, material, materialFiles, images, gradings } = detail;
  const canSubmit = submission.status === "not_submitted" || submission.status === "resubmit_required";
  const pdfFile = materialFiles.find(
    (f) => f.contentType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf"),
  );
  const pdfUrl = pdfFile ? `/api/files/material/${pdfFile.id}` : null;
  const hasResult = submission.status === "returned" || submission.status === "done" || gradings.length > 0;

  return (
    <div>
      <MarkRead submissionId={submission.id} />
      <div className="page-head" style={{ marginBottom: 14 }}>
        <Link href="/home" className="db-badge">← 課題一覧へ</Link>
        <h1 style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          {assignment.title || material.name}
          <StatusBadge status={submission.status} />
        </h1>
        <p>
          {detail.student.name} ・ {material.subject}
          {submission.rangeText ? ` ・ 範囲 ${submission.rangeText}` : ""}
          {submission.sessionNo > 1 ? ` ・ ${submission.sessionNo}回目` : ""}
        </p>
      </div>

      <div className="card">
        <h2>課題</h2>
        {assignment.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{assignment.instructions}</p>}
        {material.description && <p className="muted">{material.description}</p>}
        {materialFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {materialFiles.map((f) => (
              <a key={f.id} href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">
                📎 {f.fileName}
              </a>
            ))}
          </div>
        )}
        {!assignment.instructions && !material.description && materialFiles.length === 0 && (
          <p className="muted">課題の補足はありません。</p>
        )}
      </div>

      {canSubmit && (
        <div className="card">
          <h2>{submission.status === "resubmit_required" ? "再提出する" : "答案を提出する"}</h2>
          {submission.status === "resubmit_required" && (
            <p className="r-NG" style={{ marginTop: 0 }}>
              先生から再提出の依頼があります。コメントを確認して、もう一度提出してください。
            </p>
          )}
          <SubmitPanel
            submissionId={submission.id}
            resubmit={submission.status === "resubmit_required"}
            pdfUrl={pdfUrl}
          />
        </div>
      )}

      {(submission.status === "submitted" || submission.status === "grading") && (
        <div className="card">
          <p className="muted" style={{ textAlign: "center", padding: "12px 0", margin: 0 }}>
            提出を受け付けました。採点結果をお待ちください。
          </p>
        </div>
      )}

      {hasResult && (
        <div className="card">
          <h2>採点結果・コメント</h2>
          <GradingHistory gradings={gradings} />
          {submission.status === "returned" && (
            <div style={{ marginTop: 12 }}>
              <ActionButton action={confirmReturned.bind(null, submission.id)} successMessage="確認しました。">
                確認して完了にする
              </ActionButton>
            </div>
          )}
          {submission.status === "done" && (
            <p style={{ color: "#7c3aed", fontWeight: 700, marginTop: 12 }}>
              この課題は完了しました。おつかれさまでした！
            </p>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="card">
          <h2>提出した答案</h2>
          <AnswerImages images={images} />
        </div>
      )}
    </div>
  );
}
