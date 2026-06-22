import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { StudentsGrid, type StudentRow } from "./students-grid";

export default async function StudentsPage() {
  const p = await requireOperator();
  const rows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, p.organizationId))
    .orderBy(asc(students.name));

  const isAdmin = p.role === "admin";
  const list: StudentRow[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    loginId: s.loginId,
    active: s.active,
    hasPin: s.pinHash != null,
    // PINの平文は管理者にのみ渡す(最高権限)。
    pin: isAdmin ? s.pinPlain : undefined,
  }));

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>生徒管理</h1>
        <p>
          表の最下行で生徒を追加できます（学年はプルダウン、ログインID・PINは自動割当・編集可）。
          現在 {list.length} 名。
        </p>
      </div>

      <StudentsGrid students={list} />
    </div>
  );
}
