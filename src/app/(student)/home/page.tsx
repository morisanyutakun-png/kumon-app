import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { encourageMessage } from "@/lib/encourage";
import { listGradingHistory, listNotifications, listSubmissions } from "@/lib/queries";
import { Mascot } from "@/components/mascot";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import type { SubmissionStatus } from "@/db/schema";

const CTA: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "ていしゅつする",
  resubmit_required: "もう一度ていしゅつ",
  returned: "けっかを見る",
};

// toC向けの鮮やかな教科カラー
function subjectColor(subject: string): string {
  switch (subject) {
    case "算数": return "#1aa3e6";
    case "国語": return "#ff5d8f";
    case "理科": return "#18c39a";
    case "社会": return "#ff8a3d";
    case "英語": return "#7c5cfc";
    case "プログラミング": return "#13b6c9";
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
    <Link href={`/submissions/${r.submissionId}`} className="task">
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
      {cta && <span className="task-cta" style={{ background: color }}>{cta}</span>}
    </Link>
  );
}

function Section({ title, rows, empty }: { title: string; rows: SubmissionRow[]; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section style={{ marginBottom: 22 }}>
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

  // 学年に応じたメッセージ(生徒のみ)。保護者は概況メッセージ。
  let message = "お子さまの今日の課題と結果を確認できます。";
  if (p.role === "student" && p.studentId) {
    const [s] = await db
      .select({ grade: students.grade })
      .from(students)
      .where(eq(students.id, p.studentId))
      .limit(1);
    message = encourageMessage(s?.grade ?? "");
  }
  const greet = p.role === "student" ? `こんにちは、${p.name} さん！` : "こんにちは！";

  const stats: { label: string; value: string | number; fg: string; bg: string }[] = [
    { label: "やること", value: todo.length, fg: "#1583c4", bg: "#e8f5fd" },
    { label: "かんりょう", value: doneCount, fg: "#0f9e74", bg: "#e7f7f1" },
    { label: "合格りつ", value: passRate === null ? "—" : `${passRate}%`, fg: "#e2741a", bg: "#fff2e6" },
  ];

  return (
    <div>
      {/* ヒーロー: キャラ + 学年別メッセージ */}
      <div className="learn-hero">
        <div className="learn-hero-body">
          <div className="learn-hero-title">{greet}</div>
          <div className="learn-hero-sub">{message}</div>
        </div>
        <span className="learn-hero-mascot" aria-hidden>
          <Mascot className="learn-mascot" />
        </span>
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
        {stats.map((s) => (
          <div key={s.label} className="lstat" style={{ background: s.bg }}>
            <div className="lstat-num" style={{ color: s.fg }}>{s.value}</div>
            <div className="lstat-label">{s.label}</div>
          </div>
        ))}
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
