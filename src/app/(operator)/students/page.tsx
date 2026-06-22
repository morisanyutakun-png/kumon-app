import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { createStudent, deleteStudent } from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";

export default async function StudentsPage() {
  const p = await requireOperator();
  const rows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, p.organizationId))
    .orderBy(asc(students.name));

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>生徒管理</h1>
          <p>生徒の登録・編集と、メール無し生徒の簡易ログイン(ID/PIN)を管理します。</p>
          <div className="metric-row">
            <span className="metric-chip">{rows.length} 名</span>
          </div>
        </div>
        <details className="action-menu">
          <summary className="btn-primary">生徒を追加</summary>
          <div className="action-menu-body">
            <ActionForm action={createStudent} submitLabel="登録する">
              <div className="form-row">
                <label htmlFor="name">氏名 *</label>
                <input id="name" name="name" required placeholder="山田 太郎" />
              </div>
              <div className="form-row">
                <label htmlFor="grade">学年</label>
                <input id="grade" name="grade" placeholder="小3" />
              </div>
              <div className="form-row">
                <label htmlFor="loginId">ログインID (任意)</label>
                <input id="loginId" name="loginId" placeholder="taro" />
              </div>
              <div className="form-row">
                <label htmlFor="pin">PIN (任意)</label>
                <input id="pin" name="pin" placeholder="1234" />
              </div>
            </ActionForm>
          </div>
        </details>
      </div>

      <div className="card">
        <h2>生徒一覧 ({rows.length}名)</h2>
        <div className="grid-scroll" style={{ border: "none" }}>
          <table className="record-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>学年</th>
                <th>ログインID</th>
                <th className="right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">生徒がいません</td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/students/${s.id}`} style={{ fontWeight: 600 }}>
                        {s.name}
                      </Link>
                      {!s.active && (
                        <span className="badge" style={{ marginLeft: 8, background: "#f1f5f9", color: "#64748b" }}>
                          停止中
                        </span>
                      )}
                    </td>
                    <td>{s.grade || "—"}</td>
                    <td className="muted">{s.loginId || "—"}</td>
                    <td className="right">
                      <span className="actions-cell" style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                        <Link href={`/students/${s.id}/edit`} className="db-badge">編集</Link>
                        <ActionButton
                          action={deleteStudent.bind(null, s.id)}
                          variant="destructive"
                          confirm={`生徒「${s.name}」と関連する割当・提出を削除しますか?`}
                          successMessage="削除しました。"
                        >
                          削除
                        </ActionButton>
                      </span>
                    </td>
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
