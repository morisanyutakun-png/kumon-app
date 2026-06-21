import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { listSubmissions } from "@/lib/queries";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { SubmissionTable } from "@/components/submission-table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { submissionStatusEnum } from "@/db/schema";
import type { SubmissionStatus } from "@/db/schema";

const FILTERS: { key: string; label: string; statuses?: SubmissionStatus[] }[] = [
  { key: "all", label: "すべて" },
  { key: "submitted", label: "提出済み", statuses: ["submitted"] },
  { key: "grading", label: "採点中", statuses: ["grading"] },
  { key: "resubmit_required", label: "再提出依頼", statuses: ["resubmit_required"] },
  { key: "not_submitted", label: "未提出", statuses: ["not_submitted"] },
  { key: "returned", label: "返却済み", statuses: ["returned"] },
  { key: "done", label: "完了", statuses: ["done"] },
];

export default async function GradingListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const p = await requireOperator();
  const { status } = await searchParams;

  const valid = (submissionStatusEnum.enumValues as string[]).includes(
    status ?? "",
  )
    ? ([status] as SubmissionStatus[])
    : undefined;

  const rows = await listSubmissions(p.organizationId, { statuses: valid });
  const activeKey = valid ? valid[0] : "all";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">採点</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive =
            (f.key === "all" && activeKey === "all") || f.statuses?.[0] === activeKey;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/grading" : `/grading?status=${f.key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {f.statuses
                ? SUBMISSION_STATUS_LABELS[f.statuses[0]]
                : f.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6">
          <SubmissionTable rows={rows} hrefBase="/grading" />
        </CardContent>
      </Card>
    </div>
  );
}
