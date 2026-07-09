import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { listSubmissions } from "@/lib/queries";
import { TaskList } from "@/components/task-card";

function taskRank(status: string): number {
  if (status === "resubmit_required") return 0;
  if (status === "not_submitted") return 1;
  return 2;
}

export default async function StudentTasksPage() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const rows = await listSubmissions(p.organizationId, { studentIds: idList });

  const tasks = rows
    .filter((r) => r.status === "not_submitted" || r.status === "resubmit_required")
    .sort((a, b) => taskRank(a.status) - taskRank(b.status) || b.updatedAt.getTime() - a.updatedAt.getTime());
  const resubmits = tasks.filter((r) => r.status === "resubmit_required");
  const unsubmitted = tasks.filter((r) => r.status === "not_submitted");
  const waitingCount = rows.filter((r) => r.status === "submitted" || r.status === "grading").length;

  let grade = "";
  if (p.role === "student" && p.studentId) {
    const [s] = await db.select({ grade: students.grade }).from(students).where(eq(students.id, p.studentId)).limit(1);
    grade = s?.grade ?? "";
  }
  const sec = divisionForGrade(grade) === "secondary";

  return (
    <div>
      <div className="page-head task-page-head">
        <div>
          <h1>{sec ? "課題" : "かだい"}</h1>
          <p>
            {sec
              ? "ここには、いま実施できる未提出・再提出だけを表示します。"
              : "いま取り組める課題だけを出しているよ。"}
          </p>
        </div>
        <div className="task-page-count">
          <b>{tasks.length}</b>
          <span>{sec ? "実施可" : "できる課題"}</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty task-empty">
          <b>{sec ? "実施できる課題はありません。" : "いまできる課題はないよ。"}</b>
          {waitingCount > 0 ? (
            <span>
              {sec ? "提出済みのものは自己採点で確認できます。" : "出した課題は、こたえあわせで見られるよ。"}
              <Link href="/self-grade" className="db-badge">{sec ? "自己採点へ" : "こたえあわせへ"}</Link>
            </span>
          ) : (
            <span>{sec ? "新しい課題が届くとここに表示されます。" : "新しい課題がとどくと、ここに出るよ。"}</span>
          )}
        </div>
      ) : (
        <div className="student-section-stack">
          {resubmits.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "再提出" : "もう一度やる"}
                <span className="lsection-n">{resubmits.length}</span>
              </div>
              <TaskList rows={resubmits} sec={sec} />
            </section>
          )}
          {unsubmitted.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "未提出" : "まだ出していない課題"}
                <span className="lsection-n">{unsubmitted.length}</span>
              </div>
              <TaskList rows={unsubmitted} sec={sec} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
