import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  PenLine,
  UploadCloud,
} from "lucide-react";

import { canAccessStudent, requirePrincipal } from "@/lib/access";
import { isSecondary } from "@/lib/division";
import { getSubmissionDetail } from "@/lib/queries";
import { confirmReturned } from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { SelfGradeSplit } from "@/components/self-grade-split";
import { GradingHistory } from "@/components/grading-history";
import { MarkRead } from "@/components/mark-read";
import { MaterialCoverIcon } from "@/components/material-cover-icon";
import { StatusBadge } from "@/components/status-badge";
import { subjectAccentColor } from "@/lib/material-covers";
import { SubmitForm } from "./submit-form";

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

  const { submission, assignment, material, materialFiles, solutionFiles, returnedFiles, images, gradings } = detail;
  const sec = isSecondary(detail.student.grade);
  const canSubmit =
    submission.status === "not_submitted" || submission.status === "resubmit_required";
  // 課題本体(問題)PDF。解答解説(answer_key)は materialFiles から除外済み。
  const pdfFile = materialFiles.find(
    (f) => f.contentType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf"),
  );
  const pdfUrl = pdfFile ? `/api/files/material/${pdfFile.id}` : null;
  const rangeLabel = submission.rangeText || assignment.rangeText || material.name;
  const sessionLabel = submission.sessionNo > 1 ? `${submission.sessionNo}回目` : "初回";
  const title = assignment.title || material.name;
  const accentStyle = {
    "--submission-accent": subjectAccentColor(material.subject),
  } as CSSProperties;
  // 提出後(採点待ち含む)と再提出時は、解答解説と前回答案を見直せるようにする。
  const afterSubmit =
    !canSubmit ||
    (submission.status === "resubmit_required" &&
      (submission.attemptCount > 0 || images.length > 0 || gradings.length > 0));
  const hasResult =
    submission.status === "returned" || submission.status === "done" || gradings.length > 0;
  const canSeeReturnedPdf =
    submission.status === "returned" ||
    submission.status === "done" ||
    submission.status === "resubmit_required";

  return (
    <div className="submission-page submission-page-minimal">
      <MarkRead submissionId={submission.id} />

      <Link href="/home" className="submission-back">
        <ArrowLeft size={16} aria-hidden />
        課題一覧へ
      </Link>

      <section className="submission-sheet" style={accentStyle}>
        <div className="submission-book-head">
          <MaterialCoverIcon
            materialName={material.name}
            subject={material.subject}
            className="submission-cover-large"
          />
          <div className="submission-book-main">
            <div className="submission-book-line">
              <span className="submission-label">今回の教材</span>
              <StatusBadge status={submission.status} />
            </div>
            <h1 className="submission-title">{title}</h1>
            <div className="submission-meta">
              <span>{material.subject}</span>
              <span>{rangeLabel}</span>
              <span>{sessionLabel}</span>
            </div>
          </div>
        </div>

        {(assignment.instructions || material.description) && (
          <p className="submission-note">{assignment.instructions || material.description}</p>
        )}

        {materialFiles.length > 0 ? (
          <div className="submission-file-list">
            {materialFiles.map((f) => (
              <div key={f.id} className="submission-file-row">
                <span className="submission-file-icon"><FileText size={19} aria-hidden /></span>
                <span className="submission-file-main">
                  <b>{f.fileName}</b>
                  <small>問題PDF</small>
                </span>
                <span className="submission-file-actions">
                  <a href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="submission-mini-button">
                    <ExternalLink size={15} aria-hidden />
                    開く
                  </a>
                  <a href={`/api/files/material/${f.id}?dl=1`} className="submission-mini-button">
                    <Download size={15} aria-hidden />
                    保存
                  </a>
                </span>
              </div>
            ))}
          </div>
        ) : (
          !assignment.instructions && !material.description && (
            <p className="submission-muted">課題の補足はありません。</p>
          )
        )}

        {canSubmit && (
          <div className="submission-submit-block">
          {submission.status === "resubmit_required" && (
            <p className="submission-alert">
              先生から再提出の依頼があります。コメントを確認して、もう一度提出してください。
            </p>
          )}
          {pdfUrl ? (
            <>
              <Link
                href={`/submissions/${submission.id}/write`}
                className="submission-write-cta"
              >
                <PenLine size={21} aria-hidden />
                <span>
                  <b>画面で解く</b>
                  <small>保存後、この画面で提出します</small>
                </span>
              </Link>
              <div id="submit" className="submit-panel">
                <div className="submit-panel-head">
                  <b><UploadCloud size={16} aria-hidden />答案を提出</b>
                  <span>PDF・写真は最大3件まで</span>
                </div>
                <SubmitForm submissionId={submission.id} resubmit={submission.status === "resubmit_required"} secondary={sec} />
              </div>
            </>
          ) : (
            <div id="submit" className="submit-panel">
              <div className="submit-panel-head">
                <b><UploadCloud size={16} aria-hidden />答案を提出</b>
                <span>PDF・写真は最大3件まで</span>
              </div>
              <SubmitForm submissionId={submission.id} resubmit={submission.status === "resubmit_required"} secondary={sec} />
            </div>
          )}
          </div>
        )}
      </section>

      {/* 提出後: 答え合わせ(自己採点) — 解答解説 + 自分の答案 を即時開示 */}
      {afterSubmit && (
        <div id="self-grade" className="card selfgrade">
          <h2>答え合わせ（自己採点）</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {submission.status === "resubmit_required"
              ? "前回の答案と解答解説を見直して、もう一度解き直しましょう。"
              : "提出おつかれさま！解答解説を見て、自分の答案と照らし合わせて丸つけをしましょう。"}
          </p>

          {solutionFiles.length > 0 && images.length > 0 ? (
            /* 答案(左)と解答・解説(右)を同一画面で並べて見比べる。 */
            <SelfGradeSplit solutions={solutionFiles.map((f) => ({ id: f.id, fileName: f.fileName }))}>
              <AnswerImages images={images} large />
            </SelfGradeSplit>
          ) : (
            <>
              {solutionFiles.length > 0 ? (
                <div className="selfgrade-sol">
                  <div className="selfgrade-label">📕 解答・解説</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {solutionFiles.map((f) => (
                      <div key={f.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 700 }}>📄 {f.fileName}</span>
                        <a href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="btn-primary">解答を開く</a>
                        <a href={`/api/files/material/${f.id}?dl=1`} className="db-badge">保存する</a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted">この課題には解答解説が登録されていません。先生の採点をお待ちください。</p>
              )}

              {images.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="selfgrade-label">📝 提出した自分の答案</div>
                  <AnswerImages images={images} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(submission.status === "submitted" || submission.status === "grading") && (
        <div className="card">
          <p className="muted" style={{ textAlign: "center", padding: "12px 0", margin: 0 }}>
            提出を受け付けました。先生の採点結果もお待ちください。
          </p>
        </div>
      )}

      {hasResult && (
        <div className="card">
          <h2>先生からの採点結果・コメント</h2>
          <GradingHistory gradings={gradings} />
          {canSeeReturnedPdf && returnedFiles.length > 0 && (
            <div className="returned-pdf-list">
              <div className="selfgrade-label">先生の添削PDF</div>
              {returnedFiles.map((f) => (
                <div key={f.id} className="returned-pdf-row">
                  <span>{f.fileName}</span>
                  <a href={`/api/files/returned/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">開く</a>
                  <a href={`/api/files/returned/${f.id}?dl=1`} className="db-badge">保存する</a>
                </div>
              ))}
            </div>
          )}
          {assignment.status === "completed" && (
            <div className="complete-book">
              <b>教材終了！</b>
              <span>一冊分のPDFを受け取れます。</span>
              <a href={`/api/files/material-complete/${assignment.id}?dl=1`} className="btn-primary">一冊分PDFを保存</a>
            </div>
          )}
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
    </div>
  );
}
