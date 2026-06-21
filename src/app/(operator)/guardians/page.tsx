import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { guardianStudents, students, users } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { createGuardian, linkGuardianStudent } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function GuardiansPage() {
  const p = await requireOperator();

  const parents = await db
    .select()
    .from(users)
    .where(
      and(eq(users.organizationId, p.organizationId), eq(users.role, "parent")),
    )
    .orderBy(asc(users.name));

  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, p.organizationId))
    .orderBy(asc(students.name));

  const links = await db
    .select({
      guardianUserId: guardianStudents.guardianUserId,
      studentName: students.name,
    })
    .from(guardianStudents)
    .innerJoin(students, eq(guardianStudents.studentId, students.id))
    .where(eq(guardianStudents.organizationId, p.organizationId));

  const childrenByGuardian = new Map<string, string[]>();
  for (const l of links) {
    const arr = childrenByGuardian.get(l.guardianUserId) ?? [];
    arr.push(l.studentName);
    childrenByGuardian.set(l.guardianUserId, arr);
  }

  const selectCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">保護者管理</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">保護者を追加</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createGuardian} submitLabel="追加">
              <div className="space-y-2">
                <Label htmlFor="name">氏名 *</Label>
                <Input id="name" name="name" required placeholder="保護者 一郎" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス *</Label>
                <Input id="email" name="email" type="email" required placeholder="parent@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">初期パスワード *</Label>
                <Input id="password" name="password" required placeholder="パスワード" />
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">保護者と生徒を紐づけ</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={linkGuardianStudent} submitLabel="紐づける">
              <div className="space-y-2">
                <Label htmlFor="guardianUserId">保護者</Label>
                <select id="guardianUserId" name="guardianUserId" className={selectCls} required>
                  <option value="">選択してください</option>
                  {parents.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="studentId">生徒</Label>
                <select id="studentId" name="studentId" className={selectCls} required>
                  <option value="">選択してください</option>
                  {studentRows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.grade})
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">保護者一覧 ({parents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {parents.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              まだ保護者が登録されていません。
            </p>
          ) : (
            <ul className="divide-y">
              {parents.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-slate-500">{g.email}</div>
                  </div>
                  <div className="text-sm text-slate-600">
                    担当: {childrenByGuardian.get(g.id)?.join("、") || "（未紐づけ）"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
