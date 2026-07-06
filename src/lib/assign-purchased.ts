/**
 * 購入科目 → 生徒への教材割り当て(コア)。
 *
 * 生徒の subscription に紐づく購入科目を、対応する中高部の org 教材に変換し、
 * 未割り当てぶんだけ assignments(+submissions) を作成する。
 *
 * 手動(運営ボタン)・将来の自動割り当ての両方から呼べる純粋なコアにしてある。
 *   - 手動:   admin-actions の assignPurchasedSubjectsAction(operator の user.id を渡す)
 *   - 自動:   provision の発行時(生徒作成と同時)から。
 */
import "server-only";

import { and, asc, eq } from "drizzle-orm";

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
import {
  matchesPurchaseTarget,
  materialSubjectsForPurchase,
  materialTargetsForPurchase,
} from "@/lib/subject-map";

export interface AssignResult {
  assigned: number;
  skipped: number;
  matched: number;
  subjects: string[];
  reason?: "no_subscription" | "no_subjects" | "no_materials";
}

export async function assignPurchasedSubjects(opts: {
  organizationId: string;
  studentId: string;
  /** 運営の操作なら operator の user.id、自動割り当てなら null。 */
  assignedById: string | null;
}): Promise<AssignResult> {
  const { organizationId, studentId, assignedById } = opts;

  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.studentId, studentId), eq(subscriptions.organizationId, organizationId)))
    .limit(1);
  if (!sub) return { assigned: 0, skipped: 0, matched: 0, subjects: [], reason: "no_subscription" };

  const subjRows = await db
    .select({ subjectId: subscriptionSubjects.subjectId })
    .from(subscriptionSubjects)
    .where(eq(subscriptionSubjects.subscriptionId, sub.id));
  const subjectIds = subjRows.map((r) => r.subjectId);
  const labels = materialSubjectsForPurchase(subjectIds);
  const targets = materialTargetsForPurchase(subjectIds);
  if (labels.length === 0) return { assigned: 0, skipped: 0, matched: 0, subjects: [], reason: "no_subjects" };

  const allSecondaryMaterials = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, organizationId), eq(materials.division, "secondary")))
    .orderBy(asc(materials.sortOrder), asc(materials.subject), asc(materials.name));

  const matchedById = new Map<string, (typeof allSecondaryMaterials)[number]>();
  for (const target of targets) {
    for (const material of allSecondaryMaterials) {
      if (matchesPurchaseTarget(material, target)) {
        matchedById.set(material.id, material);
      }
    }
  }
  const mats = [...matchedById.values()];
  if (mats.length === 0) return { assigned: 0, skipped: 0, matched: 0, subjects: labels, reason: "no_materials" };

  const existing = await db
    .select({ materialId: assignments.materialId })
    .from(assignments)
    .where(and(eq(assignments.organizationId, organizationId), eq(assignments.studentId, studentId)));
  const have = new Set(existing.map((e) => e.materialId));

  let assigned = 0;
  let skipped = 0;
  for (const m of mats) {
    if (have.has(m.id)) {
      skipped++;
      continue;
    }
    const unitRows = await db
      .select()
      .from(units)
      .where(eq(units.materialId, m.id))
      .orderBy(asc(units.sortOrder));
    const sessionRange = initialSessionRange(m, unitRows, 1) || "";
    // 既存の単発割り当てと同様、assignment と初回 submission を対で作る。
    await db.transaction(async (tx) => {
      const [a] = await tx
        .insert(assignments)
        .values({
          organizationId,
          studentId,
          materialId: m.id,
          title: m.name,
          rangeText: sessionRange,
          assignedById: assignedById ?? undefined,
        })
        .returning();
      await tx.insert(submissions).values({
        organizationId,
        assignmentId: a.id,
        studentId,
        status: "not_submitted",
        sessionNo: 1,
        rangeText: sessionRange,
      });
    });
    assigned++;
  }
  return { assigned, skipped, matched: mats.length, subjects: labels };
}
