import Link from "next/link";

import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listGradingHistory, listNotifications, listSubmissions } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import type { SubmissionStatus } from "@/db/schema";

const CTA: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "ていしゅつする",
  resubmit_required: "もう一度ていしゅつ",
  returned: "けっかを見る",
};

function subjectColor(subject: string): string {
  switch (subject) {
    case "算数": return "#2aa8e0";
    case "国語": return "#ef5a5a";
    case "理科": return "#22b07d";
    case "社会": return "#f59e0b";
    case "英語": return "#8b5cf6";
    default: return "#1c9dd8";
  }
}

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function TaskCard({ r }: { r: SubmissionRow }) {
  const cta = CTA[r.status];
  const color = subjectColor(r.subject);
  return (
    <Link href={`/submissions/${r.submissionId}`} className="task" style={{ ["--accent" as string]: color }}>
      <span className="task-ico" style={{ background: color }}>{(r.subject || "課")[0]}</span>
      <div className="task-main">
        <div className="task-title">
          {r.assignmentTitle || r.materialName}
          <StatusBadge status={r.status} />
        </div>
        <div className="task-meta">
          {r.subject}
          {r.rangeText ? ` ・ ${r.rangeText}` : ""}
          {r.dueDate ? ` ・ きげん ${fmtDue(r.dueDate)}` : ""}
        </div>
      </div>
      {cta && <span className="task-cta">{cta}</span>}
    </Link>
  );
}

function Section({ title, rows, empty }: { title: string; rows: SubmissionRow[]; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section style={{ marginBottom: 20 }}>
      <div className="lsection">{title}<span className="lsection-n">{rows.length}</span></div>
      {rows.length === 0 ? (
        <div className="lcard-empty">{empty}</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
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

  const greet = p.role === "student" ? `こんにちは、${p.name} さん！` : "こんにちは！";

  return (
    <div>
      {/* あいさつバンド */}
      <div className="learn-hero">
        <span className="learn-hero-ico" aria-hidden>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4 3 8l9 4 9-4-9-4z" /><path d="M21 8v6" /><path d="M7 11v4c0 1.5 2.7 3 5 3s5-1.5 5-3v-4" />
          </svg>
        </span>
        <div>
          <div className="learn-hero-title">{greet}</div>
          <div className="learn-hero-sub">きょうの課題にとりくもう。教材を見て、答案を出すと先生がまるつけして返します。</div>
        </div>
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
        <div className="lstat"><div className="lstat-num">{doneCount}</div><div className="lstat-label">かんりょう</div></div>
        <div className="lstat"><div className="lstat-num">{passRate === null ? "—" : `${passRate}%`}</div><div className="lstat-label">合格りつ</div></div>
      </div>

      <Section title="やること" rows={todo} empty="いまやることはありません。よくできました！" />
      <Section title="けっかまち" rows={waiting} />
      <Section title="へんきゃく・かくにん" rows={returned} />

      {rows.length === 0 && (
        <div className="lcard-empty">まだ課題がとどいていません。先生からの課題をまってね。</div>
      )}
    </div>
  );
}
