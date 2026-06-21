import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { materials, students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { createAssignment } from "@/lib/actions/admin-actions";
import { listSubmissions } from "@/lib/queries";
import { ActionForm } from "@/components/action-form";
import { SubmissionTable } from "@/components/submission-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function AssignmentsPage() {
  const p = await requireOperator();

  const [studentRows, materialRows, allSubmissions] = await Promise.all([
    db
      .select()
      .from(students)
      .where(eq(students.organizationId, p.organizationId))
      .orderBy(asc(students.name)),
    db
      .select()
      .from(materials)
      .where(eq(materials.organizationId, p.organizationId))
      .orderBy(asc(materials.name)),
    listSubmissions(p.organizationId),
  ]);

  const selectCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">課題割当</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">課題を割り当てる</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createAssignment} submitLabel="割り当てる">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="studentId">生徒 *</Label>
                <select id="studentId" name="studentId" className={selectCls} required>
                  <option value="">選択してください</option>
                  {studentRows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.grade})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="materialId">教材 *</Label>
                <select id="materialId" name="materialId" className={selectCls} required>
                  <option value="">選択してください</option>
                  {materialRows.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.subject ? `[${m.subject}] ` : ""}
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">課題タイトル</Label>
                <Input id="title" name="title" placeholder="（未入力なら教材名）" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rangeText">範囲</Label>
                <Input id="rangeText" name="rangeText" placeholder="A-1 (1〜10)" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">提出期限</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">生徒への指示</Label>
              <Textarea
                id="instructions"
                name="instructions"
                rows={2}
                placeholder="答案を写真に撮って提出してください。"
              />
            </div>
          </ActionForm>
          {studentRows.length === 0 || materialRows.length === 0 ? (
            <p className="mt-3 text-sm text-amber-600">
              ※ 先に生徒と教材を登録してください。
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            割当済みの課題 ({allSubmissions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SubmissionTable
            rows={allSubmissions}
            hrefBase="/grading"
            emptyText="まだ課題が割り当てられていません。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
