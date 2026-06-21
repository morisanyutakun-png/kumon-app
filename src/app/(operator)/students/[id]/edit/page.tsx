import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { updateStudent } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function StudentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await requireOperator();
  const [s] = await db
    .select()
    .from(students)
    .where(
      and(eq(students.id, id), eq(students.organizationId, p.organizationId)),
    )
    .limit(1);
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/students" className="text-sm text-blue-600 hover:underline">
        ← 生徒一覧へ
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">生徒を編集</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateStudent} submitLabel="更新">
            <input type="hidden" name="id" value={s.id} />
            <div className="space-y-2">
              <Label htmlFor="name">氏名 *</Label>
              <Input id="name" name="name" required defaultValue={s.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">学年</Label>
              <Input id="grade" name="grade" defaultValue={s.grade} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loginId">ログインID</Label>
              <Input id="loginId" name="loginId" defaultValue={s.loginId ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN を再設定 (空欄なら変更なし)</Label>
              <Input id="pin" name="pin" placeholder="新しいPIN" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={s.active}
                className="h-4 w-4 rounded border-slate-300"
              />
              在籍中 (チェックを外すと生徒ログイン不可)
            </label>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
