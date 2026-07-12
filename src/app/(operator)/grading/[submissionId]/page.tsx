import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOperator } from "@/lib/access";
import { getSubmissionDetail, listMistakeTags } from "@/lib/queries";
import { completeSubmission } from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { GradingHistory } from "@/components/grading-history";
import { StatusBadge } from "@/components/status-badge";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { GradePanel } from "./grade-panel";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ja-JP");
}

export default async function GradingDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const p = await requireOperator();
  const detail = await getSubmissionDetail(p.organizationId, submissionId);
  if (!detail) notFound();

  const { submission, assignment, student, material, solutionFiles, returnedFiles, images, gradings, events } = detail;
  const mistakeTags = await listMistakeTags(p.organizationId);
  const autoAdvance = material.progressType !== "manual";
  const canGrade = submission.status === "submitted" || submission.status === "grading";

  const defaults = {
    score: submission.draftScore ?? "",
    maxScore: submission.draftMaxScore ?? "",
    result: (submission.draftResult ?? "") as "" | "ok" | "ng",
    comment: submission.draftComment ?? "",
  };
  const latestReturned = returnedFiles[0] ?? null;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <Link href="/grading" className="db-badge">← 採点一覧へ戻る</Link>
        <h1 style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          {assignment.title || material.name}
          <StatusBadge status={submission.status} />
        </h1>
        <p>
          {student.name}（{student.grade}） ・ {material.subject} ・ 範囲{" "}
          {submission.rangeText || assignment.rangeText || material.name} ・ {submission.sessionNo}回目
        </p>
      </div>

      <div className="grade-workspace">
        {/* 左: 添削済みPDFがあればそれを見ながら入力。なければ提出答案を表示。 */}
        <div className="grade-canvas">
          <div className="grade-canvas-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span>{latestReturned ? "添削済みPDFプレビュー" : "提出された答案"}</span>
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {latestReturned && (
                <a href={`/api/files/returned/${latestReturned.id}`} target="_blank" rel="noreferrer" className="db-badge">添削PDFを開く</a>
              )}
              {images.length > 0 && (
                <a href={`/api/files/submission-pdf/${submission.id}?dl=1`} className="db-badge">
                  答案PDFを保存
                </a>
              )}
            </span>
          </div>
          <div className="grade-canvas-body">
            {latestReturned ? (
              <div className="answer-pdf-large">
                <div className="answer-pdf-head">
                  <span className="answer-pdf-icon">PDF</span>
                  <span className="answer-pdf-name">{latestReturned.fileName}</span>
                  <a href={`/api/files/returned/${latestReturned.id}?dl=1`} className="db-badge">保存する</a>
                </div>
                <iframe src={`/api/files/returned/${latestReturned.id}`} title={latestReturned.fileName} />
              </div>
            ) : (
              <AnswerImages images={images} large />
            )}
          </div>
        </div>

        {/* 右: 採点パネル */}
        <aside className="grade-side">
          {canGrade && (
            <div className="card" style={{ margin: 0 }}>
              <h2>採点</h2>
              <GradePanel
                submissionId={submission.id}
                mistakeTags={mistakeTags}
                defaults={defaults}
                autoAdvance={autoAdvance}
                hasDraft={submission.draftUpdatedAt != null}
              />
            </div>
          )}

          {submission.status === "returned" && (
            <div className="card" style={{ margin: 0 }}>
              <h2>返却済み</h2>
              <p className="hint">生徒の確認待ち、または完了にできます。</p>
              <div style={{ marginTop: 10 }}>
                <ActionButton action={completeSubmission.bind(null, submission.id)} variant="secondary" successMessage="完了にしました。">
                  完了にする
                </ActionButton>
              </div>
            </div>
          )}
          {submission.status === "resubmit_required" && (
            <div className="card" style={{ margin: 0 }}><p className="r-NG">再提出を依頼済みです。生徒の再提出を待っています。</p></div>
          )}
          {submission.status === "not_submitted" && (
            <div className="card" style={{ margin: 0 }}><p className="hint">まだ提出されていません。</p></div>
          )}
          {submission.status === "done" && (
            <div className="card" style={{ margin: 0 }}><p className="hint">この課題は完了しました。</p></div>
          )}

          <div className="card" style={{ margin: "16px 0 0" }}>
            <h2>採点履歴</h2>
            <GradingHistory gradings={gradings} />
          </div>

          {(returnedFiles.length > 0 || solutionFiles.length > 0) && (
            <div className="card" style={{ margin: "16px 0 0" }}>
              <h2>配布PDF</h2>
              {returnedFiles.length > 0 && (
                <div className="pdf-link-group">
                  <b>添削済み返却PDF</b>
                  {returnedFiles.map((f) => (
                    <div key={f.id} className="returned-pdf-row">
                      <span>{f.fileName}</span>
                      <a href={`/api/files/returned/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">開く</a>
                    </div>
                  ))}
                </div>
              )}
              {solutionFiles.length > 0 && (
                <div className="pdf-link-group">
                  <b>解答解説PDF</b>
                  {solutionFiles.map((f) => (
                    <div key={f.id} className="returned-pdf-row">
                      <span>{f.fileName}</span>
                      <a href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">開く</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>状態の履歴</h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13, color: "var(--muted)" }}>
          {events.map((e) => (
            <li key={e.id} style={{ display: "flex", gap: 12, padding: "3px 0" }}>
              <span style={{ color: "#94a3b8" }}>{fmt(e.createdAt)}</span>
              <span>
                {e.fromStatus ? `${SUBMISSION_STATUS_LABELS[e.fromStatus]} → ` : ""}
                {SUBMISSION_STATUS_LABELS[e.toStatus]}
                {e.note ? `（${e.note}）` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
