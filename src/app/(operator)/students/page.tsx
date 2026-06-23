import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { RosterGrid, type RosterRow } from "./roster-grid";

export default async function PeoplePage() {
  const p = await requireOperator();
  const isAdmin = p.role === "admin";

  const [studentRows, links] = await Promise.all([
    db
      .select()
      .from(students)
      .where(eq(students.organizationId, p.organizationId))
      .orderBy(asc(students.name)),
    db
      .select({
        studentId: guardianStudents.studentId,
        gId: users.id,
        gName: users.name,
        gEmail: users.email,
        gPw: users.pwPlain,
      })
      .from(guardianStudents)
      .innerJoin(users, eq(guardianStudents.guardianUserId, users.id))
      .where(eq(guardianStudents.organizationId, p.organizationId)),
  ]);

  // 生徒ごとの保護者(先頭の1名を同じ行に表示)
  const guardianByStudent = new Map<string, RosterRow["guardian"]>();
  for (const l of links) {
    if (!guardianByStudent.has(l.studentId)) {
      guardianByStudent.set(l.studentId, {
        id: l.gId,
        name: l.gName,
        email: l.gEmail,
        pw: isAdmin ? l.gPw : undefined,
      });
    }
  }

  const rows: RosterRow[] = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    loginId: s.loginId,
    active: s.active,
    hasPin: s.pinHash != null,
    pin: isAdmin ? s.pinPlain : undefined,
    guardian: guardianByStudent.get(s.id),
  }));

  const withGuardian = rows.filter((r) => r.guardian).length;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>生徒・保護者</h1>
        <p>
          生徒 {rows.length} 名（うち保護者あり {withGuardian} 名）。1つの表で左が生徒・右が保護者です。
          最下行から1行でまとめて追加できます（保護者は任意）。
        </p>
      </div>

      <RosterGrid rows={rows} admin={isAdmin} />
    </div>
  );
}
