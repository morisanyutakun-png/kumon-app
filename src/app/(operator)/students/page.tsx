import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { linkGuardianStudent } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";
import { StudentsGrid, type StudentRow } from "./students-grid";
import { GuardiansGrid, type GuardianRow } from "../guardians/guardians-grid";

export default async function PeoplePage() {
  const p = await requireOperator();
  const isAdmin = p.role === "admin";

  const [studentRows, parents, links] = await Promise.all([
    db
      .select()
      .from(students)
      .where(eq(students.organizationId, p.organizationId))
      .orderBy(asc(students.name)),
    db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, p.organizationId), eq(users.role, "parent")))
      .orderBy(asc(users.name)),
    db
      .select({ guardianUserId: guardianStudents.guardianUserId, studentName: students.name })
      .from(guardianStudents)
      .innerJoin(students, eq(guardianStudents.studentId, students.id))
      .where(eq(guardianStudents.organizationId, p.organizationId)),
  ]);

  const childrenByGuardian = new Map<string, string[]>();
  for (const l of links) {
    const arr = childrenByGuardian.get(l.guardianUserId) ?? [];
    arr.push(l.studentName);
    childrenByGuardian.set(l.guardianUserId, arr);
  }

  const studentList: StudentRow[] = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    loginId: s.loginId,
    active: s.active,
    hasPin: s.pinHash != null,
    pin: isAdmin ? s.pinPlain : undefined,
  }));

  const parentList: GuardianRow[] = parents.map((g) => ({
    id: g.id,
    name: g.name,
    email: g.email,
    children: childrenByGuardian.get(g.id) ?? [],
    pw: isAdmin ? g.pwPlain : undefined,
  }));

  const selectCls = "h-9 rounded-none border border-slate-300 bg-white px-3 text-sm";

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>生徒・保護者</h1>
        <p>
          生徒 {studentList.length} 名 ・ 保護者 {parentList.length} 名。表の最下行から追加できます
          （学年プルダウン、ログインID・PIN・パスワードは自動割当・編集可）。
        </p>
      </div>

      <div className="lsection" style={{ marginBottom: 10 }}>生徒<span className="lsection-n">{studentList.length}</span></div>
      <StudentsGrid students={studentList} />

      <div className="lsection" style={{ margin: "26px 0 10px" }}>保護者<span className="lsection-n">{parentList.length}</span></div>
      <GuardiansGrid parents={parentList} />

      <div className="card" style={{ marginTop: 22 }}>
        <h2>保護者と生徒を紐づけ</h2>
        <ActionForm action={linkGuardianStudent} submitLabel="紐づける">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-row">
              <label htmlFor="guardianUserId">保護者</label>
              <select id="guardianUserId" name="guardianUserId" className={selectCls} required>
                <option value="">選択してください</option>
                {parents.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}（{g.email}）</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="studentId">生徒</label>
              <select id="studentId" name="studentId" className={selectCls} required>
                <option value="">選択してください</option>
                {studentRows.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
