import Link from "next/link";

import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listSubmissions } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionStatus } from "@/db/schema";

const ACTION_HINT: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "提出する",
  resubmit_required: "再提出する",
  returned: "結果を見る",
};

function fmtDue(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default async function StudentHome() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const rows = ids === "*" ? [] : await listSubmissions(p.organizationId, { studentIds: ids });

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
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>課題一覧</h1>
        <p>提出する課題と、返却された結果を確認できます。</p>
      </div>

      <div className="card">
        <div className="grid-scroll" style={{ border: "none" }}>
          <table className="record-table">
            <thead>
              <tr>
                <th>課題</th>
                <th>教科 / 範囲</th>
                <th>状態</th>
                <th>期限</th>
                <th className="right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="empty">現在、割り当てられた課題はありません。</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.submissionId}>
                    <td>
                      <Link href={`/submissions/${r.submissionId}`} style={{ fontWeight: 600 }}>
                        {r.assignmentTitle || r.materialName}
                      </Link>
                      <div className="muted">{r.studentName}</div>
                    </td>
                    <td className="muted">
                      {r.subject}{r.rangeText ? ` / ${r.rangeText}` : ""}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted">{fmtDue(r.dueDate)}</td>
                    <td className="right">
                      <Link href={`/submissions/${r.submissionId}`} className={ACTION_HINT[r.status] ? "btn-primary" : "db-badge"} style={{ padding: "5px 12px", fontSize: 12 }}>
                        {ACTION_HINT[r.status] ?? "開く"}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
