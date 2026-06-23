import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listGradingHistory } from "@/lib/queries";
import { GradeReport } from "@/components/grade-report";
import { StudentSwitcher } from "@/components/student-switcher";

export default async function StudentGradesPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);

  // 運営者は組織全体の成績管理へ
  if (ids === "*") redirect("/grades");

  if (ids.length === 0) {
    return (
      <div>
        <div className="page-head" style={{ marginBottom: 14 }}>
          <h1>成績</h1>
        </div>
        <div className="card"><p className="empty">表示できる生徒が登録されていません。</p></div>
      </div>
    );
  }

  // 閲覧対象は「自分(保護者は紐づく生徒)」のみ。?student= は許可IDのみ採用。
  const sp = await searchParams;
  const selected = sp.student && ids.includes(sp.student) ? sp.student : ids[0];

  // 切替UI用に、許可された生徒の名前だけ取得
  const linked = await db
    .select({ id: students.id, name: students.name, grade: students.grade })
    .from(students)
    .where(inArray(students.id, ids));
  const me = linked.find((s) => s.id === selected);

  // selected は必ず ids に含まれるため、他生徒の成績は取得され得ない
  const rows = await listGradingHistory(p.organizationId, { studentIds: [selected] });

  const isParent = p.role === "parent";

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>成績</h1>
          {linked.length > 1 && (
            <StudentSwitcher options={linked} current={selected} base="/history" mode="query" label="お子さま" />
          )}
        </div>
        <p style={{ marginTop: 6 }}>
          {isParent ? `${me?.name ?? ""} さんの成績` : "あなたの成績"}
          {me?.grade ? ` ・ ${me.grade}` : ""} です。
        </p>
      </div>

      <GradeReport rows={rows} />
    </div>
  );
}
