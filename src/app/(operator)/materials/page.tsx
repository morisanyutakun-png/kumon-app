import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials, units } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { getActiveDivision } from "@/lib/active-division";
import { DIVISION_LABEL } from "@/lib/division";
import { ELEMENTARY_SUBJECTS, SECONDARY_SUBJECTS } from "./subjects";
import {
  MaterialsWorkspace,
  type WsMaterial,
  type WsSelected,
} from "./materials-workspace";

/** 教材の範囲サマリ（PHP materials_units_digest 相当）。 */
function rangeSummary(
  m: { progressType: string; numberStart: number | null; numberEnd: number | null },
  unitTitles: string[],
): string {
  if (m.progressType === "manual") return "手入力";
  if (m.progressType === "number") {
    const s = m.numberStart ?? 0;
    const e = m.numberEnd ?? 0;
    return s > 0 && e >= s ? `No.${s}〜${e}` : "番号未設定";
  }
  const n = unitTitles.length;
  if (n === 0) return "範囲なし";
  const first = (unitTitles[0] ?? "").trim();
  const last = (unitTitles[n - 1] ?? "").trim();
  return n === 1 ? `1件 / ${first}` : `${n}件 / ${first}〜${last}`;
}

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const p = await requireOperator();
  const division = await getActiveDivision();
  const { m: selectedId } = await searchParams;

  const rows = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, p.organizationId), eq(materials.division, division)))
    .orderBy(asc(materials.subject), asc(materials.sortOrder), asc(materials.name));

  // 全教材の範囲(単元)をまとめて取得しサマリに使う。
  const allUnits =
    rows.length > 0
      ? await db
          .select()
          .from(units)
          .where(inArray(units.materialId, rows.map((r) => r.id)))
          .orderBy(asc(units.sortOrder))
      : [];
  const unitsByMat = new Map<string, string[]>();
  for (const u of allUnits) {
    const arr = unitsByMat.get(u.materialId) ?? [];
    arr.push(u.title);
    unitsByMat.set(u.materialId, arr);
  }

  const list: WsMaterial[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    subject: m.subject,
    progressType: m.progressType,
    completionAction: m.completionAction,
    numberStart: m.numberStart,
    numberEnd: m.numberEnd,
    rangeSummary: rangeSummary(m, unitsByMat.get(m.id) ?? []),
  }));

  // 選択中の教材の詳細（範囲・ファイル）を読み込む。
  let selected: WsSelected | null = null;
  const chosen = selectedId ? rows.find((r) => r.id === selectedId) : undefined;
  if (chosen) {
    const unitRows = await db
      .select()
      .from(units)
      .where(eq(units.materialId, chosen.id))
      .orderBy(asc(units.sortOrder));
    const fileRows = await db
      .select()
      .from(materialFiles)
      .where(eq(materialFiles.materialId, chosen.id))
      .orderBy(asc(materialFiles.createdAt));
    selected = {
      id: chosen.id,
      name: chosen.name,
      subject: chosen.subject,
      description: chosen.description,
      progressType: chosen.progressType,
      completionAction: chosen.completionAction,
      numberStart: chosen.numberStart,
      numberEnd: chosen.numberEnd,
      units: unitRows.map((u) => ({ id: u.id, title: u.title })),
      files: fileRows.map((f) => ({ id: f.id, fileName: f.fileName, unitId: f.unitId })),
    };
  }

  const subjects = division === "secondary" ? SECONDARY_SUBJECTS : ELEMENTARY_SUBJECTS;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <h1>教材管理（{DIVISION_LABEL[division]}）</h1>
        <p>教材を選ぶと右で範囲を編集できます。範囲を並べて各範囲にPDFを割り当て、課題割り当て画面で生徒に配布します。</p>
      </div>
      <MaterialsWorkspace materials={list} selected={selected} subjects={subjects} />
    </div>
  );
}
