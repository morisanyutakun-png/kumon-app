import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { MaterialsGrid, type MaterialRow } from "./materials-grid";

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
          .where(inArray(materialFiles.materialId, rows.map((r) => r.id)))
      : [];

  const list: MaterialRow[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    subject: m.subject,
    progressType: m.progressType,
    files: files
      .filter((f) => f.materialId === m.id)
      .map((f) => ({ id: f.id, fileName: f.fileName })),
  }));

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>教材管理</h1>
        <p>
          表の最下行で教材を追加できます（教科・進め方はプルダウン）。課題ファイルや番号範囲は
          各行から設定。現在 {list.length} 件。
        </p>
      </div>

      <MaterialsGrid materials={list} />
    </div>
  );
}
