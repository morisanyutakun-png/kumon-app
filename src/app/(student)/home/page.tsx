import Link from "next/link";

import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listSubmissions } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SubmissionStatus } from "@/db/schema";

const ACTION_HINT: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "答案を提出しましょう",
  resubmit_required: "再提出してください",
  returned: "結果を確認できます",
};

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

export default async function StudentHome() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const rows =
    ids === "*"
      ? []
      : await listSubmissions(p.organizationId, { studentIds: ids });

  // 未提出・再提出依頼を上に
  const order: Record<SubmissionStatus, number> = {
    resubmit_required: 0,
    not_submitted: 1,
    returned: 2,
    submitted: 3,
    grading: 4,
    done: 5,
  };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">課題一覧</h1>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          現在、割り当てられた課題はありません。
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Link key={r.submissionId} href={`/submissions/${r.submissionId}`}>
              <Card className="transition-colors hover:bg-slate-50">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {r.assignmentTitle || r.materialName}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {r.studentName} ・ {r.subject}
                      {r.rangeText ? ` ・ ${r.rangeText}` : ""}
                      {r.dueDate ? ` ・ 期限 ${fmtDue(r.dueDate)}` : ""}
                    </div>
                  </div>
                  {ACTION_HINT[r.status] && (
                    <span className="shrink-0 text-xs font-medium text-blue-600">
                      {ACTION_HINT[r.status]} →
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
