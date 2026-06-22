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
  returned: "#22b07d",
  resubmit_required: "#ef5a5a",
  done: "#8b5cf6",
};

const NEED_ACTION: SubmissionStatus[] = ["submitted", "grading", "resubmit_required"];
const STATUS_GROUP: SubmissionStatus[] = ["not_submitted", "returned", "done"];

function StatIcon({ status }: { status: SubmissionStatus }) {
  const c = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (status) {
    case "submitted":
      return (<svg {...c}><path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /><path d="M12 3v12M7 8l5-5 5 5" /></svg>);
    case "grading":
      return (<svg {...c}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>);
    case "resubmit_required":
      return (<svg {...c}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>);
    case "returned":
      return (<svg {...c}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>);
    case "done":
      return (<svg {...c}><path d="M8 21h8M12 17v4" /><path d="M5 4h14v5a7 7 0 0 1-14 0z" /></svg>);
    default:
      return (<svg {...c}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /></svg>);
  }
}

function Tile({ status, count }: { status: SubmissionStatus; count: number }) {
  const color = STATUS_COLOR[status];
  return (
    <Link href={`/grading?status=${status}`} className="stat" style={{ ["--accent" as string]: color }}>
      <div className="stat-top">
        <span className="stat-icon" style={{ color }}><StatIcon status={status} /></span>
        <span className="stat-go">一覧 →</span>
      </div>
      <div className="stat-num" style={{ color: count === 0 ? "#c2ccd6" : color }}>{count}</div>
      <div className="stat-label">{SUBMISSION_STATUS_LABELS[status]}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const p = await requireOperator();
  const [counts, needGrading] = await Promise.all([
    countByStatus(p.organizationId),
    listSubmissions(p.organizationId, { statuses: ["submitted", "grading"] }),
  ]);

  const waiting = counts.submitted + counts.grading;
  const today = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div>
      {/* ブランドのウェルカムバンド */}
      <div className="dash-hero">
        <div className="dash-hero-l">
          <div className="dash-hero-greet">こんにちは、{p.name} さん</div>
          <div className="dash-hero-sub">{today}</div>
        </div>
        <div className="dash-hero-r">
          <div className="dash-hero-metric">
            <span className="dash-hero-num">{waiting}</span>
            <span className="dash-hero-unit">件</span>
          </div>
          <div className="dash-hero-mlabel">採点待ち</div>
          <Link href="/grading?status=submitted" className="dash-hero-cta">採点する →</Link>
        </div>
      </div>

      <div className="section-title">要対応</div>
      <div className="stat-grid">
        {NEED_ACTION.map((s) => <Tile key={s} status={s} count={counts[s]} />)}
      </div>

      <div className="section-title">状況</div>
      <div className="stat-grid">
        {STATUS_GROUP.map((s) => <Tile key={s} status={s} count={counts[s]} />)}
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <h2>未採点（提出済み・採点中）</h2>
        {needGrading.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-ico">✓</span>
            <div>
              <div className="dash-empty-title">すべて採点済みです</div>
              <div className="dash-empty-sub">新しい提出が届くとここに表示されます。</div>
            </div>
          </div>
        ) : (
          <SubmissionTable rows={needGrading} hrefBase="/grading" />
        )}
      </div>
    </div>
  );
}
