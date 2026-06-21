import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOperator } from "@/lib/access";
import { getSubmissionDetail, listMistakeTags } from "@/lib/queries";
import {
  completeSubmission,
  startGrading,
} from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { GradingHistory } from "@/components/grading-history";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const { submission, assignment, student, material, images, gradings, events } =
    detail;
  const mistakeTags = await listMistakeTags(p.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/grading" className="text-sm text-blue-600 hover:underline">
          ← 採点一覧へ戻る
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {assignment.title || material.name}
          </h1>
          <StatusBadge status={submission.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {student.name} ({student.grade}) ・ {material.subject} ・ 範囲{" "}
          {submission.rangeText || assignment.rangeText || material.name} ・{" "}
          {submission.sessionNo}回目
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左: 答案画像 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">提出された答案</CardTitle>
          </CardHeader>
          <CardContent>
            <AnswerImages images={images} />
          </CardContent>
        </Card>

        {/* 右: 採点操作 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">採点</CardTitle>
            </CardHeader>
            <CardContent>
              {submission.status === "submitted" && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    この提出物は未採点です。採点を開始してください。
                  </p>
                  <ActionButton
                    action={startGrading.bind(null, submission.id)}
                    successMessage="採点を開始しました。"
                  >
                    採点を開始
                  </ActionButton>
                </div>
              )}

              {submission.status === "grading" && (
                <GradeForm submissionId={submission.id} mistakeTags={mistakeTags} />
              )}

              {submission.status === "returned" && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    返却済みです。生徒の確認待ち、または完了にできます。
                  </p>
                  <ActionButton
                    action={completeSubmission.bind(null, submission.id)}
                    variant="secondary"
                    successMessage="完了にしました。"
                  >
                    完了にする
                  </ActionButton>
                </div>
              )}

              {submission.status === "resubmit_required" && (
                <p className="text-sm text-rose-600">
                  再提出を依頼済みです。生徒の再提出を待っています。
                </p>
              )}

              {submission.status === "not_submitted" && (
                <p className="text-sm text-slate-500">
                  まだ提出されていません。
                </p>
              )}

              {submission.status === "done" && (
                <p className="text-sm text-violet-600">この課題は完了しました。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">採点履歴</CardTitle>
            </CardHeader>
            <CardContent>
              <GradingHistory gradings={gradings} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 状態遷移ログ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">状態の履歴</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-slate-600">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="text-slate-400">{fmt(e.createdAt)}</span>
                <span>
                  {e.fromStatus
                    ? `${SUBMISSION_STATUS_LABELS[e.fromStatus]} → `
                    : ""}
                  {SUBMISSION_STATUS_LABELS[e.toStatus]}
                  {e.note ? `（${e.note}）` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
