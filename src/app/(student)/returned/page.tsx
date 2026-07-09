import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { listSubmissions } from "@/lib/queries";
import { TaskList } from "@/components/task-card";

/** 先生からの返却物だけを確認する画面。自己採点は /self-grade に分離する。 */
export default async function ReturnedPage() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const rows = await listSubmissions(p.organizationId, { studentIds: idList });

  const resubmits = rows
    .filter((r) => r.status === "resubmit_required")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const returned = rows
    .filter((r) => r.status === "returned")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const done = rows
    .filter((r) => r.status === "done")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  let grade = "";
  if (p.role === "student" && p.studentId) {
    const [s] = await db.select({ grade: students.grade }).from(students).where(eq(students.id, p.studentId)).limit(1);
    grade = s?.grade ?? "";
  }
  const sec = divisionForGrade(grade) === "secondary";
  const total = resubmits.length + returned.length + done.length;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>{sec ? "返却" : "へんきゃく"}</h1>
        <p>
          {sec
            ? "先生の採点コメント、添削PDF、再提出の指示だけを確認します。"
            : "せんせいから返ってきたコメントや、てんさくPDFを見るところだよ。"}
        </p>
      </div>

      {total === 0 ? (
        <div className="empty task-empty">
          <b>{sec ? "返却された課題はありません。" : "まだ へんきゃくはないよ。"}</b>
          <span>{sec ? "提出済みのものは自己採点で確認できます。" : "出した課題は、こたえあわせで見られるよ。"}</span>
        </div>
      ) : (
        <div className="student-section-stack">
          {resubmits.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "再提出が必要" : "もう一度ていしゅつ"}
                <span className="lsection-n">{resubmits.length}</span>
              </div>
              <TaskList rows={resubmits} sec={sec} />
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
          {done.length > 0 && (
            <section>
              <div className="lsection">
                {sec ? "確認済み" : "かくにんずみ"}
                <span className="lsection-n">{done.length}</span>
              </div>
              <TaskList rows={done} sec={sec} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
