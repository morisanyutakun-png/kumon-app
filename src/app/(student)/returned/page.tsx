import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { listSubmissions } from "@/lib/queries";
import { TaskList } from "@/components/task-card";

/** 返却・答え合わせ専用画面。提出後の自己採点(採点待ち)と、先生からの返却をまとめる。 */
export default async function ReturnedPage() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const rows = await listSubmissions(p.organizationId, { studentIds: idList });

  const waiting = rows.filter((r) => r.status === "submitted" || r.status === "grading");
  const returned = rows.filter((r) => r.status === "returned");

  let grade = "";
  if (p.role === "student" && p.studentId) {
    const [s] = await db.select({ grade: students.grade }).from(students).where(eq(students.id, p.studentId)).limit(1);
    grade = s?.grade ?? "";
  }
  const sec = divisionForGrade(grade) === "secondary";
  const total = waiting.length + returned.length;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>{sec ? "返却・答え合わせ" : "へんきゃく・こたえあわせ"}</h1>
        <p>
          {sec
            ? "提出した課題の自己採点と、先生からの返却をここで確認します。"
            : "ていしゅつした課題の こたえあわせと、せんせいからの へんきゃくが ここに でるよ。"}
        </p>
      </div>

      {total === 0 ? (
        <div className="empty">
          {sec ? "返却された課題はまだありません。" : "まだ へんきゃくは ないよ。"}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {waiting.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "採点待ち・自己採点できます" : "こたえあわせできるよ"}
                <span className="lsection-n">{waiting.length}</span>
              </div>
              <TaskList rows={waiting} sec={sec} />
            </section>
          )}
          {returned.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "先生から返却" : "せんせいから へんきゃく"}
                <span className="lsection-n">{returned.length}</span>
              </div>
              <TaskList rows={returned} sec={sec} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
