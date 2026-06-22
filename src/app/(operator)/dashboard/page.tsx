import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { countByStatus, listSubmissions } from "@/lib/queries";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { SubmissionTable } from "@/components/submission-table";
import type { SubmissionStatus } from "@/db/schema";

const SUMMARY: { status: SubmissionStatus }[] = [
  { status: "not_submitted" },
  { status: "submitted" },
  { status: "grading" },
  { status: "resubmit_required" },
  { status: "returned" },
  { status: "done" },
];

export default async function DashboardPage() {
  const p = await requireOperator();
  const [counts, needGrading] = await Promise.all([
    countByStatus(p.organizationId),
    listSubmissions(p.organizationId, { statuses: ["submitted", "grading"] }),
  ]);

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>ダッシュボード</h1>
        <p>提出状況の集計と、採点待ちの一覧です。</p>
      </div>

      <div className="dashboard">
        {SUMMARY.map((c) => (
          <Link key={c.status} href={`/grading?status=${c.status}`} className="tile">
            <div className="tile-num">{counts[c.status]}</div>
            <div className="tile-label">{SUBMISSION_STATUS_LABELS[c.status]}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <h2>未採点（提出済み・採点中）</h2>
        <SubmissionTable
          rows={needGrading}
          hrefBase="/grading"
          emptyText="未採点の提出物はありません。"
        />
      </div>
    </div>
  );
}
