import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOperator } from "@/lib/access";
import { getSubmissionDetail, listMistakeTags } from "@/lib/queries";
import { completeSubmission, startGrading } from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { GradingHistory } from "@/components/grading-history";
import { StatusBadge } from "@/components/status-badge";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { GradeForm } from "./grade-form";

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

  const { submission, assignment, student, material, images, gradings, events } = detail;
  const mistakeTags = await listMistakeTags(p.organizationId);

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="grading-cols">
        <div className="card">
          <h2>提出された答案</h2>
          <AnswerImages images={images} />
        </div>

        <div>
          <div className="card">
            <h2>採点</h2>
            {submission.status === "submitted" && (
              <div className="form-grid">
                <p className="hint">この提出物は未採点です。採点を開始してください。</p>
                <div>
                  <ActionButton
                    action={startGrading.bind(null, submission.id)}
                    successMessage="採点を開始しました。"
                  >
                    採点を開始
                  </ActionButton>
                </div>
              </div>
            )}
            {submission.status === "grading" && (
              <GradeForm submissionId={submission.id} mistakeTags={mistakeTags} />
            )}
            {submission.status === "returned" && (
              <div className="form-grid">
                <p className="hint">返却済みです。生徒の確認待ち、または完了にできます。</p>
                <div>
                  <ActionButton
                    action={completeSubmission.bind(null, submission.id)}
                    variant="secondary"
                    successMessage="完了にしました。"
                  >
                    完了にする
                  </ActionButton>
                </div>
              </div>
            )}
            {submission.status === "resubmit_required" && (
              <p className="r-NG">再提出を依頼済みです。生徒の再提出を待っています。</p>
            )}
            {submission.status === "not_submitted" && <p className="hint">まだ提出されていません。</p>}
            {submission.status === "done" && <p className="hint">この課題は完了しました。</p>}
          </div>

          <div className="card">
            <h2>採点履歴</h2>
            <GradingHistory gradings={gradings} />
          </div>
        </div>
      </div>

      <div className="card">
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
