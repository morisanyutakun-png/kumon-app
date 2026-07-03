import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials, units } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { ELEMENTARY_SUBJECTS, SECONDARY_SUBJECTS } from "../../materials-grid";
import { CurriculumEditor } from "./curriculum-editor";

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

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.materialId, m.id))
    .orderBy(asc(units.sortOrder));

  const fileRows = await db
    .select()
    .from(materialFiles)
    .where(eq(materialFiles.materialId, m.id))
    .orderBy(asc(materialFiles.createdAt));

  const subjects = m.division === "secondary" ? SECONDARY_SUBJECTS : ELEMENTARY_SUBJECTS;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/materials" className="text-sm text-blue-600 hover:underline">
        ← 教材一覧へ
      </Link>
      <div className="page-head">
        <h1>教材を編集 — {m.name}</h1>
        <p>教材名・進め方を設定し、範囲を並べて各範囲にPDFを割り当てます。設定後、課題割り当て画面で生徒に配布できます。</p>
      </div>
      <CurriculumEditor
        material={{
          id: m.id,
          name: m.name,
          subject: m.subject,
          description: m.description,
          progressType: m.progressType,
          completionAction: m.completionAction,
          numberStart: m.numberStart,
          numberEnd: m.numberEnd,
        }}
        units={unitRows.map((u) => ({ id: u.id, title: u.title }))}
        files={fileRows.map((f) => ({ id: f.id, fileName: f.fileName, unitId: f.unitId }))}
        subjects={subjects}
      />
    </div>
  );
}
