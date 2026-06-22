import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { countByStatus, listSubmissions } from "@/lib/queries";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { SubmissionTable } from "@/components/submission-table";
import type { SubmissionStatus } from "@/db/schema";

const STATUS_COLOR: Record<SubmissionStatus, string> = {
  not_submitted: "#94a3b8",
  submitted: "#1c9dd8",
  grading: "#f59e0b",
  returned: "#10b981",
  resubmit_required: "#ef4444",
  done: "#8b5cf6",
};

const NEED_ACTION: SubmissionStatus[] = ["submitted", "grading", "resubmit_required"];
const STATUS_GROUP: SubmissionStatus[] = ["not_submitted", "returned", "done"];

function Tile({ status, count }: { status: SubmissionStatus; count: number }) {
  return (
    <Link
      href={`/grading?status=${status}`}
      className="stat"
      style={{ ["--accent" as string]: STATUS_COLOR[status] }}
    >
      <div className="stat-top">
        <span className={`stat-num${count === 0 ? " is-zero" : ""}`}>{count}</span>
        <span className="stat-go">一覧 →</span>
      </div>
      <span className="stat-label">{SUBMISSION_STATUS_LABELS[status]}</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const p = await requireOperator();
  const [counts, needGrading] = await Promise.all([
    countByStatus(p.organizationId),
    listSubmissions(p.organizationId, { statuses: ["submitted", "grading"] }),
  ]);

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 4 }}>
        <h1>ダッシュボード</h1>
        <p>提出状況の集計と、採点待ちの一覧です。</p>
      </div>

      <div className="section-title">要対応</div>
      <div className="stat-grid">
        {NEED_ACTION.map((s) => (
          <Tile key={s} status={s} count={counts[s]} />
        ))}
      </div>

      <div className="section-title">状況</div>
      <div className="stat-grid">
        {STATUS_GROUP.map((s) => (
          <Tile key={s} status={s} count={counts[s]} />
        ))}
      </div>

      <div className="card" style={{ marginTop: 22 }}>
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
