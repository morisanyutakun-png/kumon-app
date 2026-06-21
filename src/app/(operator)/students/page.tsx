import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { createStudent, deleteStudent } from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function StudentsPage() {
  const p = await requireOperator();
  const rows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, p.organizationId))
    .orderBy(asc(students.name));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">生徒管理</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">生徒を追加</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createStudent} submitLabel="追加">
              <div className="space-y-2">
                <Label htmlFor="name">氏名 *</Label>
                <Input id="name" name="name" required placeholder="山田 太郎" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">学年</Label>
                <Input id="grade" name="grade" placeholder="小3" />
              </div>
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-slate-500">
                  メールを持たない生徒向けの簡易ログイン (任意)。保護者経由でも確認できます。
                </p>
                <div className="space-y-2">
                  <Label htmlFor="loginId">ログインID</Label>
                  <Input id="loginId" name="loginId" placeholder="taro" />
                </div>
                <div className="mt-2 space-y-2">
                  <Label htmlFor="pin">PIN (あいことば)</Label>
                  <Input id="pin" name="pin" placeholder="1234" />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">生徒一覧 ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                まだ生徒が登録されていません。
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>氏名</TableHead>
                    <TableHead>学年</TableHead>
                    <TableHead>ログインID</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.name}
                        {!s.active && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                            停止中
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{s.grade || "—"}</TableCell>
                      <TableCell className="text-slate-500">
                        {s.loginId || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/students/${s.id}/edit`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            編集
                          </Link>
                          <ActionButton
                            action={deleteStudent.bind(null, s.id)}
                            variant="ghost"
                            confirm={`「${s.name}」を削除しますか？関連する課題・提出も削除されます。`}
                            successMessage="削除しました。"
                            className="h-auto px-2 py-0 text-sm text-rose-600 hover:text-rose-700"
                          >
                            削除
                          </ActionButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
