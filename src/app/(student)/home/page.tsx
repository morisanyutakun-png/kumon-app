import Link from "next/link";

import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listNotifications, listSubmissions } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionStatus } from "@/db/schema";

const ACTION_HINT: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "提出する",
  resubmit_required: "再提出する",
  returned: "結果を見る",
};

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default async function StudentHome() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const [rows, notices] = await Promise.all([
    listSubmissions(p.organizationId, { studentIds: idList }),
    listNotifications(p.organizationId, idList, { unreadOnly: true }),
  ]);

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

      {notices.length > 0 && (
        <div className="notice-list">
          {notices.map((n) => (
            <Link
              key={n.id}
              href={n.submissionId ? `/submissions/${n.submissionId}` : "/home"}
              className="notice"
            >
              <span className="notice-ico">{n.type === "resubmit" ? "↻" : "✓"}</span>
              <span style={{ minWidth: 0 }}>
                <span className="notice-title">{n.title}</span>
                <span className="notice-body">
                  {n.studentName}
                  {n.body ? ` ・ ${n.body}` : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <p className="empty">現在、割り当てられた課題はありません。</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => {
            const hint = ACTION_HINT[r.status];
            return (
              <Link
                key={r.submissionId}
                href={`/submissions/${r.submissionId}`}
                className="card"
                style={{ display: "block", margin: 0, padding: "14px 16px", textDecoration: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: "var(--text)" }}>
                        {r.assignmentTitle || r.materialName}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="muted" style={{ marginTop: 2 }}>
                      {r.studentName} ・ {r.subject}
                      {r.rangeText ? ` ・ ${r.rangeText}` : ""}
                      {r.dueDate ? ` ・ 期限 ${fmtDue(r.dueDate)}` : ""}
                    </div>
                  </div>
                  {hint && (
                    <span className="btn-primary" style={{ flex: "0 0 auto", padding: "8px 14px", fontSize: 13 }}>
                      {hint}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
