import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { materials } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { updateMaterial } from "@/lib/actions/admin-actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function MaterialEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await requireOperator();
  const [m] = await db
    .select()
    .from(materials)
    .where(
      and(eq(materials.id, id), eq(materials.organizationId, p.organizationId)),
    )
    .limit(1);
  if (!m) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/materials" className="text-sm text-blue-600 hover:underline">
        ← 教材一覧へ
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">教材を編集</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateMaterial} submitLabel="更新">
            <input type="hidden" name="id" value={m.id} />
            <div className="space-y-2">
              <Label htmlFor="name">教材名 *</Label>
              <Input id="name" name="name" required defaultValue={m.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">教科</Label>
              <Input id="subject" name="subject" defaultValue={m.subject} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={m.description}
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
