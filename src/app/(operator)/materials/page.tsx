import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import {
  createMaterial,
  deleteMaterial,
  uploadMaterialFile,
} from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { FileUploadForm } from "@/components/file-upload-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function MaterialsPage() {
  const p = await requireOperator();
  const rows = await db
    .select()
    .from(materials)
    .where(eq(materials.organizationId, p.organizationId))
    .orderBy(asc(materials.sortOrder), asc(materials.name));

  const files =
    rows.length > 0
      ? await db
          .select()
          .from(materialFiles)
          .where(
            inArray(
              materialFiles.materialId,
              rows.map((r) => r.id),
            ),
          )
      : [];
  const filesByMaterial = new Map<string, typeof files>();
  for (const f of files) {
    const arr = filesByMaterial.get(f.materialId) ?? [];
    arr.push(f);
    filesByMaterial.set(f.materialId, arr);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">教材管理</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">教材を追加</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createMaterial} submitLabel="追加">
              <div className="space-y-2">
                <Label htmlFor="name">教材名 *</Label>
                <Input id="name" name="name" required placeholder="たし算プリント A" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">教科</Label>
                <Input id="subject" name="subject" placeholder="数学" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">説明</Label>
                <Textarea id="description" name="description" rows={3} />
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">教材一覧 ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                まだ教材が登録されていません。
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((m) => (
                  <li key={m.id} className="space-y-2 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {m.subject && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                            {m.subject}
                          </span>
                        )}
                        <span className="font-medium">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/materials/${m.id}/edit`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          編集
                        </Link>
                        <ActionButton
                          action={deleteMaterial.bind(null, m.id)}
                          variant="ghost"
                          confirm={`「${m.name}」を削除しますか？`}
                          successMessage="削除しました。"
                          className="h-auto px-2 py-0 text-sm text-rose-600 hover:text-rose-700"
                        >
                          削除
                        </ActionButton>
                      </div>
                    </div>
                    {m.description && (
                      <p className="text-sm text-slate-500">{m.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {(filesByMaterial.get(m.id) ?? []).map((f) => (
                        <a
                          key={f.id}
                          href={`/api/files/material/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border bg-white px-2 py-1 text-xs text-blue-600 hover:underline"
                        >
                          📎 {f.fileName}
                        </a>
                      ))}
                    </div>
                    <FileUploadForm
                      action={uploadMaterialFile.bind(null, m.id)}
                      accept="application/pdf,image/*"
                      buttonLabel="課題ファイル追加"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
