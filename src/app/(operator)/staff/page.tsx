import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { createOperator, resetStaffPassword } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";
import { PasswordResetForm } from "@/components/credential-forms";

export default async function StaffPage() {
  const p = await requireAdmin();

  const staff = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, p.organizationId),
        inArray(users.role, ["admin", "operator"]),
      ),
    )
    .orderBy(asc(users.role), asc(users.name));

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>スタッフ（採点者）管理</h1>
          <p>採点者(運営)アカウントを発行します。アカウント発行は管理者のみ可能です。</p>
          <div className="metric-row">
            <span className="metric-chip">{staff.length} 名</span>
          </div>
        </div>
        <details className="action-menu">
          <summary className="btn-primary">採点者を追加</summary>
          <div className="action-menu-body">
            <ActionForm action={createOperator} submitLabel="発行する">
              <div className="form-row">
                <label htmlFor="name">氏名 *</label>
                <input id="name" name="name" required placeholder="採点 花子" />
              </div>
              <div className="form-row">
                <label htmlFor="email">メールアドレス *</label>
                <input id="email" name="email" type="email" required placeholder="grader@example.com" />
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
        <h2>スタッフ一覧 ({staff.length}名)</h2>
        <div className="grid-scroll" style={{ border: "none" }}>
          <table className="record-table">
            <thead>
              <tr><th>氏名</th><th>メール</th><th>権限</th><th>パスワード再発行</th></tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <span className="badge" style={u.role === "admin" ? { background: "#ede9fe", color: "#5b21b6" } : undefined}>
                      {u.role === "admin" ? "管理者" : "採点者"}
                    </span>
                  </td>
                  <td>
                    <PasswordResetForm action={resetStaffPassword.bind(null, u.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
