import Link from "next/link";

import { MaterialCoverIcon } from "@/components/material-cover-icon";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import { subjectAccentColor } from "@/lib/material-covers";
import type { SubmissionStatus } from "@/db/schema";

/** 状態ごとの行動ラベル(生徒向け)。 */
function ctaLabel(status: SubmissionStatus, sec: boolean): string | undefined {
  switch (status) {
    case "not_submitted": return sec ? "取り組む" : "とりくむ";
    case "resubmit_required": return sec ? "やり直す" : "もう一度";
    case "submitted": case "grading": return sec ? "答え合わせ" : "こたえあわせ";
    case "returned": return sec ? "結果を見る" : "けっかを見る";
    default: return undefined;
  }
}

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** 生徒ホーム/返却で使う共通の課題カード。 */
export function TaskCard({ r, sec }: { r: SubmissionRow; sec: boolean }) {
  const cta = ctaLabel(r.status, sec);
  const color = subjectAccentColor(r.subject);
  return (
    <Link href={`/submissions/${r.submissionId}`} className="task">
      <MaterialCoverIcon materialName={r.materialName} subject={r.subject} />
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
