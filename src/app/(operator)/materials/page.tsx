import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { getActiveDivision } from "@/lib/active-division";
import { DIVISION_LABEL } from "@/lib/division";
import { MaterialsGrid, type MaterialRow } from "./materials-grid";

export default async function MaterialsPage() {
  const p = await requireOperator();
  const division = await getActiveDivision();
  const rows = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, p.organizationId), eq(materials.division, division)))
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
        <h1>教材管理（{DIVISION_LABEL[division]}）</h1>
        <p>
          表の最下行で教材を追加できます（教科・進め方はプルダウン）。課題ファイルや番号範囲は
          各行から設定。<b>{DIVISION_LABEL[division]}</b>の教材 {list.length} 件（追加すると {DIVISION_LABEL[division]} に登録されます）。
        </p>
      </div>

      <MaterialsGrid materials={list} division={division} />
    </div>
  );
}
