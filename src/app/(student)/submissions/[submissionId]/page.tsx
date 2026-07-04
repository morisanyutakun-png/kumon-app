import Link from "next/link";
import { notFound } from "next/navigation";

import { canAccessStudent, requirePrincipal } from "@/lib/access";
import { isSecondary } from "@/lib/division";
import { getSubmissionDetail } from "@/lib/queries";
import { confirmReturned } from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { SelfGradeSplit } from "@/components/self-grade-split";
import { GradingHistory } from "@/components/grading-history";
import { MarkRead } from "@/components/mark-read";
import { StatusBadge } from "@/components/status-badge";
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

  const { submission, assignment, material, materialFiles, solutionFiles, images, gradings } = detail;
  const sec = isSecondary(detail.student.grade);
  const canSubmit =
    submission.status === "not_submitted" || submission.status === "resubmit_required";
  // 課題本体(問題)PDF。解答解説(answer_key)は materialFiles から除外済み。
  const pdfFile = materialFiles.find(
    (f) => f.contentType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf"),
  );
  const pdfUrl = pdfFile ? `/api/files/material/${pdfFile.id}` : null;
  // 提出後(採点待ち含む)は、解答解説と自分の答案を出して自己採点できるようにする。
  const afterSubmit = !canSubmit; // submitted / grading / returned / done
  const hasResult =
    submission.status === "returned" || submission.status === "done" || gradings.length > 0;

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

      {/* 課題の説明・問題ファイル */}
      <div className="card">
        <h2>課題</h2>
        {assignment.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{assignment.instructions}</p>}
        {material.description && <p className="muted">{material.description}</p>}
        {materialFiles.length > 0 ? (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {materialFiles.map((f) => (
              <div key={f.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>📄 {f.fileName}</span>
                <a href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">開く</a>
                <a href={`/api/files/material/${f.id}?dl=1`} className="db-badge">保存する</a>
              </div>
            ))}
          </div>
        ) : (
          !assignment.instructions && !material.description && (
            <p className="muted">課題の補足はありません。</p>
          )
        )}
      </div>

      {/* 解く(一画面) */}
      {canSubmit && (
        <div className="card">
          <h2>{submission.status === "resubmit_required" ? "再提出する" : "この課題を解く"}</h2>
          {submission.status === "resubmit_required" && (
            <p className="r-NG" style={{ marginTop: 0 }}>
              先生から再提出の依頼があります。コメントを確認して、もう一度提出してください。
            </p>
          )}
          {pdfUrl ? (
            <>
              <Link
                href={`/submissions/${submission.id}/write`}
                className="btn-primary big"
                style={{ width: "100%" }}
              >
                ✏️ 一画面で書き込んで解く
              </Link>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
                タッチペン・指で直接書き込めます。書いた内容は自動保存され、提出するまで消えません。
                解き終わったら画面の「提出する」から提出してください。
              </p>
            </>
          ) : (
            <SubmitForm submissionId={submission.id} resubmit={submission.status === "resubmit_required"} secondary={sec} />
          )}
        </div>
      )}

      {/* 提出後: 答え合わせ(自己採点) — 解答解説 + 自分の答案 を即時開示 */}
      {afterSubmit && (
        <div className="card selfgrade">
          <h2>答え合わせ（自己採点）</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            提出おつかれさま！解答解説を見て、自分の答案と照らし合わせて丸つけをしましょう。
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
