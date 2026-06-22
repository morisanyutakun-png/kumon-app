import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { linkGuardianStudent } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";
import { GuardiansGrid, type GuardianRow } from "./guardians-grid";

export default async function GuardiansPage() {
  const p = await requireOperator();

  const parents = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, p.organizationId), eq(users.role, "parent")))
    .orderBy(asc(users.name));

  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, p.organizationId))
    .orderBy(asc(students.name));

  const links = await db
    .select({ guardianUserId: guardianStudents.guardianUserId, studentName: students.name })
    .from(guardianStudents)
    .innerJoin(students, eq(guardianStudents.studentId, students.id))
    .where(eq(guardianStudents.organizationId, p.organizationId));

  const childrenByGuardian = new Map<string, string[]>();
  for (const l of links) {
    const arr = childrenByGuardian.get(l.guardianUserId) ?? [];
    arr.push(l.studentName);
    childrenByGuardian.set(l.guardianUserId, arr);
  }

  const rows: GuardianRow[] = parents.map((g) => ({
    id: g.id,
    name: g.name,
    email: g.email,
    children: childrenByGuardian.get(g.id) ?? [],
  }));

  const selectCls = "h-9 rounded-none border border-slate-300 bg-white px-3 text-sm";

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>保護者管理</h1>
        <p>表の最下行で保護者を追加できます（パスワードは自動割当・編集可）。現在 {rows.length} 名。</p>
      </div>

      <GuardiansGrid parents={rows} />

      <div className="card" style={{ marginTop: 18 }}>
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
