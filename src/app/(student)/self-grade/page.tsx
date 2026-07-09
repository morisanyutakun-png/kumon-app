import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { listSubmissions, type SubmissionRow } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";

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

function SelfGradeCard({ r, sec }: { r: SubmissionRow; sec: boolean }) {
  const color = subjectColor(r.subject);
  return (
    <Link href={`/submissions/${r.submissionId}#self-grade`} className="task selfgrade-task">
      <span className="task-ico" style={{ background: color }}>{(r.subject || "答")[0]}</span>
      <div className="task-main">
        <div className="task-title">{r.assignmentTitle || r.materialName}<StatusBadge status={r.status} /></div>
        <div className="task-meta">
          {r.subject}
          {r.rangeText ? ` ・ ${r.rangeText}` : ""}
          {r.attemptCount > 1 ? ` ・ ${sec ? "再提出" : "もう一度"} ${r.attemptCount - 1}` : ""}
        </div>
      </div>
      <span className="task-cta" style={{ background: color }}>
        {sec ? "自己採点" : "こたえあわせ"}
      </span>
    </Link>
  );
}

function SelfGradeList({ rows, sec }: { rows: SubmissionRow[]; sec: boolean }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((r) => <SelfGradeCard key={r.submissionId} r={r} sec={sec} />)}
    </div>
  );
}

export default async function SelfGradePage() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const rows = await listSubmissions(p.organizationId, { studentIds: idList });

  const active = rows.filter((r) => r.status === "submitted" || r.status === "grading");
  const resubmits = rows.filter((r) => r.status === "resubmit_required");
  const reviewed = rows.filter((r) => r.status === "returned" || r.status === "done");

  let grade = "";
  if (p.role === "student" && p.studentId) {
    const [s] = await db.select({ grade: students.grade }).from(students).where(eq(students.id, p.studentId)).limit(1);
    grade = s?.grade ?? "";
  }
  const sec = divisionForGrade(grade) === "secondary";
  const total = active.length + resubmits.length + reviewed.length;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>{sec ? "自己採点" : "こたえあわせ"}</h1>
        <p>
          {sec
            ? "提出したらすぐに解答解説を確認できます。先生の返却を待たずに、次の範囲と並行して復習できます。"
            : "ていしゅつしたら、すぐに解答解説を見られるよ。先生のへんきゃくを待ちながら、次の課題にも進めるよ。"}
        </p>
      </div>

      {total === 0 ? (
        <div className="empty">
          {sec ? "自己採点できる提出はまだありません。" : "まだ こたえあわせできる課題はないよ。"}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {active.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "提出済み（自己採点）" : "ていしゅつずみ"}
                <span className="lsection-n">{active.length}</span>
              </div>
              <SelfGradeList rows={active} sec={sec} />
            </section>
          )}
          {resubmits.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "再提出前の見直し" : "もう一度のまえに見直す"}
                <span className="lsection-n">{resubmits.length}</span>
              </div>
              <SelfGradeList rows={resubmits} sec={sec} />
            </section>
          )}
          {reviewed.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "返却後の復習" : "へんきゃく後のふくしゅう"}
                <span className="lsection-n">{reviewed.length}</span>
              </div>
              <SelfGradeList rows={reviewed} sec={sec} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
