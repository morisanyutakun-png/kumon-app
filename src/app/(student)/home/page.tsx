import Link from "next/link";

import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listGradingHistory, listNotifications, listSubmissions } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import type { SubmissionStatus } from "@/db/schema";

const CTA: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "提出する",
  resubmit_required: "再提出する",
  returned: "結果を見る",
};

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function TaskCard({ r }: { r: SubmissionRow }) {
  const cta = CTA[r.status];
  return (
    <Link href={`/submissions/${r.submissionId}`} className="task">
      <div className="task-main">
        <div className="task-title">
          {r.assignmentTitle || r.materialName}
          <StatusBadge status={r.status} />
        </div>
        <div className="task-meta">
          {r.studentName} ・ {r.subject}
          {r.rangeText ? ` ・ ${r.rangeText}` : ""}
          {r.dueDate ? ` ・ 期限 ${fmtDue(r.dueDate)}` : ""}
        </div>
      </div>
      {cta && <span className="task-cta">{cta}</span>}
    </Link>
  );
}

function Section({ title, rows, empty }: { title: string; rows: SubmissionRow[]; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <div className="section-title">{title}（{rows.length}）</div>
      {rows.length === 0 ? (
        <p className="hint" style={{ padding: "4px 2px" }}>{empty}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => <TaskCard key={r.submissionId} r={r} />)}
        </div>
      )}
    </section>
  );
}

export default async function StudentHome() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const [rows, notices, history] = await Promise.all([
    listSubmissions(p.organizationId, { studentIds: idList }),
    listNotifications(p.organizationId, idList, { unreadOnly: true }),
    listGradingHistory(p.organizationId, { studentIds: idList }),
  ]);

  const todo = rows.filter((r) => r.status === "not_submitted" || r.status === "resubmit_required");
  const waiting = rows.filter((r) => r.status === "submitted" || r.status === "grading");
  const returned = rows.filter((r) => r.status === "returned");
  const doneCount = rows.filter((r) => r.status === "done").length;
  const passCount = history.filter((h) => h.result === "ok").length;
  const graded = history.filter((h) => h.result !== null).length;
  const passRate = graded > 0 ? Math.round((passCount / graded) * 100) : null;

  const greetName = p.role === "student" ? p.name.replace(/^ゲスト生徒.*/, "") || "" : "";

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <h1>学習ホーム{greetName ? ` — ${greetName} さん` : ""}</h1>
        <p>今日の課題に取り組みましょう。教材を見て、答案を提出すると先生が採点して返します。</p>
      </div>

      {notices.length > 0 && (
        <div className="notice-list">
          {notices.map((n) => (
            <Link key={n.id} href={n.submissionId ? `/submissions/${n.submissionId}` : "/home"} className="notice">
              <span className="notice-ico">{n.type === "resubmit" ? "↻" : "✓"}</span>
              <span style={{ minWidth: 0 }}>
                <span className="notice-title">{n.title}</span>
                <span className="notice-body">{n.studentName}{n.body ? ` ・ ${n.body}` : ""}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="learn-stats">
        <div className="lstat"><div className="lstat-num">{todo.length}</div><div className="lstat-label">やること</div></div>
        <div className="lstat"><div className="lstat-num">{doneCount}</div><div className="lstat-label">完了</div></div>
        <div className="lstat"><div className="lstat-num">{passRate === null ? "—" : `${passRate}%`}</div><div className="lstat-label">合格率</div></div>
      </div>

      <Section title="やること" rows={todo} empty="いまやることはありません。よくできました！" />
      <Section title="結果まち" rows={waiting} />
      <Section title="返却・確認" rows={returned} />

      {rows.length === 0 && (
        <p className="empty">まだ課題が割り当てられていません。</p>
      )}

      <p className="hint" style={{ marginTop: 8 }}>
        過去の成績は上部の「成績・履歴」から確認できます。
      </p>
    </div>
  );
}
