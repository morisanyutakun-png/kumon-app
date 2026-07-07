/**
 * 既存の購入科目(subscription_subjects)に一致する教材を、生徒へ一括割り当てする。
 *
 * 実行:
 *   set -a; . ./.env; [ -f .env.local ] && . ./.env.local; set +a; npm run assignments:backfill-purchased
 *
 * 確認のみ(書き込まない): DRY_RUN=1 を付ける。
 */
import { and, asc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  materials,
  submissions,
  subscriptions,
  subscriptionSubjects,
  units,
} from "@/db/schema";
import { initialSessionRange } from "@/lib/progress-db";
import { materialTargetsForPurchase, matchesPurchaseTarget } from "@/lib/subject-map";

const DRY = process.env.DRY_RUN === "1";

async function main() {
  const subs = await db
    .select({
      id: subscriptions.id,
      organizationId: subscriptions.organizationId,
      studentId: subscriptions.studentId,
    })
    .from(subscriptions)
    .where(isNotNull(subscriptions.studentId));

  let matched = 0;
  let assigned = 0;
  let skipped = 0;

  for (const sub of subs) {
    const studentId = sub.studentId;
    if (!studentId) continue;

    const subjectRows = await db
      .select({ subjectId: subscriptionSubjects.subjectId })
      .from(subscriptionSubjects)
      .where(eq(subscriptionSubjects.subscriptionId, sub.id));
    const targets = materialTargetsForPurchase(subjectRows.map((r) => r.subjectId));
    if (targets.length === 0) continue;

    const allSecondaryMaterials = await db
      .select()
      .from(materials)
      .where(and(eq(materials.organizationId, sub.organizationId), eq(materials.division, "secondary")))
      .orderBy(asc(materials.sortOrder), asc(materials.subject), asc(materials.name));

    const matchedMaterials = new Map<string, (typeof allSecondaryMaterials)[number]>();
    for (const target of targets) {
      for (const material of allSecondaryMaterials) {
        if (matchesPurchaseTarget(material, target)) {
          matchedMaterials.set(material.id, material);
        }
      }
    }
    matched += matchedMaterials.size;

    const existing = await db
      .select({ materialId: assignments.materialId })
      .from(assignments)
      .where(and(eq(assignments.organizationId, sub.organizationId), eq(assignments.studentId, studentId)));
    const have = new Set(existing.map((a) => a.materialId));

    for (const material of matchedMaterials.values()) {
      if (have.has(material.id)) {
        skipped++;
        continue;
      }

      const unitRows = await db
        .select()
        .from(units)
        .where(eq(units.materialId, material.id))
        .orderBy(asc(units.sortOrder));
      const sessionRange = initialSessionRange(material, unitRows, 1) || "";

      console.log(`${DRY ? "[DRY] " : ""}+ ${studentId} -> ${material.name} (${sessionRange})`);
      if (!DRY) {
        await db.transaction(async (tx) => {
          const [a] = await tx
            .insert(assignments)
            .values({
              organizationId: sub.organizationId,
              studentId,
              materialId: material.id,
              title: material.name,
              rangeText: sessionRange,
            })
            .returning({ id: assignments.id });
          await tx.insert(submissions).values({
            organizationId: sub.organizationId,
            assignmentId: a.id,
            studentId,
            status: "not_submitted",
            sessionNo: 1,
            rangeText: sessionRange,
          });
        });
      }
      assigned++;
    }
  }

  console.log(`完了: matched=${matched}, assigned=${assigned}, skipped=${skipped}${DRY ? " [DRY RUN]" : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
