import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { listSubmissions } from "@/lib/queries";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { SubmissionTable } from "@/components/submission-table";
import { submissionStatusEnum } from "@/db/schema";
import type { SubmissionStatus } from "@/db/schema";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "submitted", label: "提出済み" },
  { key: "grading", label: "採点中" },
  { key: "resubmit_required", label: "再提出依頼" },
  { key: "not_submitted", label: "未提出" },
  { key: "returned", label: "返却済み" },
  { key: "done", label: "完了" },
];

export default async function GradingListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const p = await requireOperator();
  const { status } = await searchParams;

  const valid = (submissionStatusEnum.enumValues as string[]).includes(status ?? "")
    ? ([status] as SubmissionStatus[])
    : undefined;

  const rows = await listSubmissions(p.organizationId, { statuses: valid });
  const activeKey = valid ? valid[0] : "all";

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>採点</h1>
        <p>提出物の一覧です。状態で絞り込めます。一括で採点するなら「一括採点」をご利用ください。</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {FILTERS.map((f) => {
          const isActive = f.key === activeKey;
          const label = f.key === "all" ? "すべて" : SUBMISSION_STATUS_LABELS[f.key as SubmissionStatus];
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/grading" : `/grading?status=${f.key}`}
              className={isActive ? "btn-primary" : "btn-secondary"}
              style={{ padding: "6px 14px", fontSize: 13 }}
            >
              {label}
            </Link>
          );
        })}
        <Link href="/grading/batch" className="db-badge" style={{ marginLeft: "auto" }}>
          一括採点へ →
        </Link>
      </div>

      <div className="card">
        <SubmissionTable rows={rows} hrefBase="/grading" />
      </div>
    </div>
  );
}
