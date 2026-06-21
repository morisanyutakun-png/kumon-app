import Link from "next/link";
import { notFound } from "next/navigation";

import { canAccessStudent, requirePrincipal } from "@/lib/access";
import { getSubmissionDetail } from "@/lib/queries";
import { confirmReturned } from "@/lib/actions/submission-actions";
import { ActionButton } from "@/components/action-button";
import { AnswerImages } from "@/components/answer-images";
import { GradingHistory } from "@/components/grading-history";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // アクセス権 (自分 / 担当する生徒のみ)
  const allowed = await canAccessStudent(p, detail.student.id);
  if (!allowed) notFound();

  const { submission, assignment, material, materialFiles, images, gradings } =
    detail;

  const canSubmit =
    submission.status === "not_submitted" ||
    submission.status === "resubmit_required";
  const hasResult =
    submission.status === "returned" ||
    submission.status === "done" ||
    gradings.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/home" className="text-sm text-blue-600 hover:underline">
          ← 課題一覧へ
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-xl font-bold">
            {assignment.title || material.name}
          </h1>
          <StatusBadge status={submission.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {detail.student.name} ・ {material.subject}
          {submission.rangeText ? ` ・ 範囲 ${submission.rangeText}` : ""}
          {submission.sessionNo > 1 ? ` ・ ${submission.sessionNo}回目` : ""}
        </p>
      </div>

      {/* 課題内容 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">課題</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignment.instructions && (
            <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p>
          )}
          {material.description && (
            <p className="text-sm text-slate-500">{material.description}</p>
          )}
          {materialFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {materialFiles.map((f) => (
                <a
                  key={f.id}
                  href={`/api/files/material/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border bg-white px-3 py-1.5 text-sm text-blue-600 hover:underline"
                >
                  📎 {f.fileName}
                </a>
              ))}
            </div>
          )}
          {!assignment.instructions &&
            !material.description &&
            materialFiles.length === 0 && (
              <p className="text-sm text-slate-400">課題の補足はありません。</p>
            )}
        </CardContent>
      </Card>

      {/* 提出 */}
      {canSubmit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {submission.status === "resubmit_required"
                ? "再提出する"
                : "答案を提出する"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submission.status === "resubmit_required" && (
              <p className="mb-3 text-sm text-rose-600">
                先生から再提出の依頼があります。コメントを確認して、もう一度提出してください。
              </p>
            )}
            <SubmitForm
              submissionId={submission.id}
              resubmit={submission.status === "resubmit_required"}
            />
          </CardContent>
        </Card>
      )}

      {/* 採点中表示 */}
      {(submission.status === "submitted" || submission.status === "grading") && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-slate-600">
            提出を受け付けました。採点結果をお待ちください。
          </CardContent>
        </Card>
      )}

      {/* 採点結果 */}
      {hasResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">採点結果・コメント</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GradingHistory gradings={gradings} />
            {submission.status === "returned" && (
              <ActionButton
                action={confirmReturned.bind(null, submission.id)}
                successMessage="確認しました。"
              >
                確認して完了にする
              </ActionButton>
            )}
            {submission.status === "done" && (
              <p className="text-sm font-medium text-violet-600">
                この課題は完了しました。おつかれさまでした！
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 提出した答案 */}
      {images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">提出した答案</CardTitle>
          </CardHeader>
          <CardContent>
            <AnswerImages images={images} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
