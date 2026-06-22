import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SubmissionTable({
  rows,
  hrefBase,
  emptyText = "該当する提出物はありません。",
}: {
  rows: SubmissionRow[];
  hrefBase: string;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <p className="empty">{emptyText}</p>;
  }
  return (
    <div className="grid-scroll" style={{ border: "none" }}>
      <table className="record-table">
        <thead>
          <tr>
            <th>生徒</th>
            <th>課題 / 範囲</th>
            <th>状態</th>
            <th className="num">提出回数</th>
            <th>提出日時</th>
            <th className="right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.submissionId}>
              <td>
                <div style={{ fontWeight: 600 }}>{r.studentName}</div>
                <div className="muted">{r.studentGrade}</div>
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{r.assignmentTitle || r.materialName}</div>
                <div className="muted">
                  {r.subject} / {r.rangeText || r.materialName}
                </div>
              </td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td className="num">{r.attemptCount}</td>
              <td>{fmtDate(r.submittedAt)}</td>
              <td className="right">
                <Link href={`${hrefBase}/${r.submissionId}`} className="db-badge">
                  開く
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
