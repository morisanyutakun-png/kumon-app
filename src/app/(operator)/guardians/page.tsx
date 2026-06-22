import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { createGuardian, linkGuardianStudent } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";

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

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>保護者管理</h1>
          <p>保護者アカウントの登録と、生徒との紐づけを管理します。</p>
          <div className="metric-row">
            <span className="metric-chip">{parents.length} 名</span>
          </div>
        </div>
        <details className="action-menu">
          <summary className="btn-primary">保護者を追加</summary>
          <div className="action-menu-body">
            <ActionForm action={createGuardian} submitLabel="登録する">
              <div className="form-row">
                <label htmlFor="name">氏名 *</label>
                <input id="name" name="name" required placeholder="保護者 一郎" />
              </div>
              <div className="form-row">
                <label htmlFor="email">メールアドレス *</label>
                <input id="email" name="email" type="email" required placeholder="parent@example.com" />
              </div>
              <div className="form-row">
                <label htmlFor="password">初期パスワード *</label>
                <input id="password" name="password" required placeholder="パスワード" />
              </div>
            </ActionForm>
          </div>
        </details>
      </div>

      <div className="card">
        <h2>保護者と生徒を紐づけ</h2>
        <ActionForm action={linkGuardianStudent} submitLabel="紐づける">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-row">
              <label htmlFor="guardianUserId">保護者</label>
              <select id="guardianUserId" name="guardianUserId" required>
                <option value="">選択してください</option>
                {parents.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}（{g.email}）</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="studentId">生徒</label>
              <select id="studentId" name="studentId" required>
                <option value="">選択してください</option>
                {studentRows.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>保護者一覧 ({parents.length}名)</h2>
        <div className="grid-scroll" style={{ border: "none" }}>
          <table className="record-table">
            <thead>
              <tr><th>氏名</th><th>メール</th><th>担当生徒</th></tr>
            </thead>
            <tbody>
              {parents.length === 0 ? (
                <tr><td colSpan={3} className="empty">保護者がいません</td></tr>
              ) : (
                parents.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td className="muted">{g.email}</td>
                    <td>{childrenByGuardian.get(g.id)?.join("、") || <span className="muted">（未紐づけ）</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
