import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import type { SubmissionStatus } from "@/db/schema";

/** 状態ごとの行動ラベル(生徒向け)。 */
function ctaLabel(status: SubmissionStatus, sec: boolean): string | undefined {
  switch (status) {
    case "not_submitted": return sec ? "提出する" : "ていしゅつする";
    case "resubmit_required": return sec ? "再提出する" : "もう一度ていしゅつ";
    case "submitted": case "grading": return sec ? "答え合わせ" : "こたえあわせ";
    case "returned": return sec ? "結果を見る" : "けっかを見る";
    default: return undefined;
  }
}

function subjectColor(subject: string): string {
  switch (subject) {
    case "算数": case "数学": return "#1aa3e6";
    case "国語": return "#ff5d8f";
    case "理科": case "物理": return "#18c39a";
    case "化学": return "#00a3a3";
    case "生物": return "#3bb54a";
    case "社会": case "地歴公民": return "#ff8a3d";
    case "英語": return "#7c5cfc";
    case "情報": case "プログラミング": return "#13b6c9";
    default: return "#1c9dd8";
  }
}

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** 生徒ホーム/返却で使う共通の課題カード。 */
export function TaskCard({ r, sec }: { r: SubmissionRow; sec: boolean }) {
  const cta = ctaLabel(r.status, sec);
  const color = subjectColor(r.subject);
  return (
    <Link href={`/submissions/${r.submissionId}`} className="task">
      <span className="task-ico" style={{ background: color }}>{(r.subject || "課")[0]}</span>
      <div className="task-main">
        <div className="task-title">{r.assignmentTitle || r.materialName}<StatusBadge status={r.status} /></div>
        <div className="task-meta">
          {r.subject}
          {r.rangeText ? ` ・ ${r.rangeText}` : ""}
          {r.dueDate ? ` ・ ${sec ? "期限" : "きげん"} ${fmtDue(r.dueDate)}` : ""}
        </div>
      </div>
      {cta && <span className="task-cta" style={{ background: color }}>{cta}</span>}
    </Link>
  );
}

export function TaskList({ rows, sec }: { rows: SubmissionRow[]; sec: boolean }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((r) => <TaskCard key={r.submissionId} r={r} sec={sec} />)}
    </div>
  );
}
