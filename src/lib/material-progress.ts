import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  gradings,
  materials,
  students,
  submissions,
  units,
} from "@/db/schema";
import type { Grading, Submission, SubmissionStatus } from "@/db/schema";

type AssignmentRow = typeof assignments.$inferSelect;
type MaterialRow = typeof materials.$inferSelect;
type UnitRow = typeof units.$inferSelect;

export type MaterialProgressState =
  | "complete"
  | "resubmit"
  | "waiting"
  | "todo"
  | "returned"
  | "empty";

export interface MaterialProgressRow {
  assignmentId: string;
  studentId: string;
  studentName: string;
  materialId: string;
  materialName: string;
  subject: string;
  totalCount: number | null;
  passedCount: number;
  waitingCount: number;
  resubmitCount: number;
  todoCount: number;
  returnedCount: number;
  isComplete: boolean;
  state: MaterialProgressState;
  currentSubmissionId: string | null;
  currentStatus: SubmissionStatus | null;
  currentRangeText: string;
}

function expectedSessionCount(
  assignment: Pick<AssignmentRow, "unitsPerSession">,
  material: Pick<MaterialRow, "progressType" | "numberStart" | "numberEnd">,
  unitRows: UnitRow[],
): number | null {
  const per = Math.max(1, assignment.unitsPerSession || 1);
  if (material.progressType === "chapter") {
    return unitRows.length > 0 ? Math.ceil(unitRows.length / per) : null;
  }
  if (material.progressType === "number") {
    const s = material.numberStart ?? 0;
    const e = material.numberEnd ?? 0;
    return s > 0 && e >= s ? Math.ceil((e - s + 1) / per) : null;
  }
  return null;
}

function latestBySubmission(gradeRows: Grading[]): Map<string, Grading> {
  const latest = new Map<string, Grading>();
  for (const g of gradeRows) {
    if (!latest.has(g.submissionId)) latest.set(g.submissionId, g);
  }
  return latest;
}

function chooseCurrent(rows: Submission[]): Submission | null {
  const sorted = [...rows].sort((a, b) => a.sessionNo - b.sessionNo);
  return (
    sorted.find((s) => s.status === "resubmit_required") ??
    sorted.find((s) => s.status === "not_submitted") ??
    sorted.find((s) => s.status === "submitted" || s.status === "grading") ??
    [...sorted].reverse().find((s) => s.status === "returned" || s.status === "done") ??
    null
  );
}

function summarizeAssignment(args: {
  assignment: AssignmentRow;
  material: MaterialRow;
  studentName: string;
  unitRows: UnitRow[];
  submissionRows: Submission[];
  gradeRows: Grading[];
}): MaterialProgressRow {
  const { assignment, material, studentName, unitRows, submissionRows, gradeRows } = args;
  const latest = latestBySubmission(gradeRows);
  const totalCount = expectedSessionCount(assignment, material, unitRows);

  let passedCount = 0;
  let waitingCount = 0;
  let resubmitCount = 0;
  let todoCount = 0;
  let returnedCount = 0;

  for (const sub of submissionRows) {
    if (sub.status === "submitted" || sub.status === "grading") waitingCount++;
    if (sub.status === "resubmit_required") resubmitCount++;
    if (sub.status === "not_submitted") todoCount++;
    if (sub.status === "returned" || sub.status === "done") returnedCount++;
    const latestGrade = latest.get(sub.id);
    if (
      latestGrade?.result === "ok" &&
      (sub.status === "returned" || sub.status === "done")
    ) {
      passedCount++;
    }
  }

  const isComplete =
    totalCount !== null &&
    totalCount > 0 &&
    passedCount >= totalCount &&
    waitingCount === 0 &&
    resubmitCount === 0 &&
    todoCount === 0;

  const current = isComplete ? null : chooseCurrent(submissionRows);
  const state: MaterialProgressState = isComplete
    ? "complete"
    : resubmitCount > 0
      ? "resubmit"
      : waitingCount > 0
        ? "waiting"
        : todoCount > 0
          ? "todo"
          : returnedCount > 0
            ? "returned"
            : "empty";

  return {
    assignmentId: assignment.id,
    studentId: assignment.studentId,
    studentName,
    materialId: material.id,
    materialName: material.name,
    subject: material.subject,
    totalCount,
    passedCount,
    waitingCount,
    resubmitCount,
    todoCount,
    returnedCount,
    isComplete,
    state,
    currentSubmissionId: current?.id ?? null,
    currentStatus: current?.status ?? null,
    currentRangeText: current?.rangeText || assignment.rangeText || "",
  };
}

export async function listMaterialProgress(
  organizationId: string,
  opts: { studentIds?: string[] } = {},
): Promise<MaterialProgressRow[]> {
  const conditions = [eq(assignments.organizationId, organizationId)];
  if (opts.studentIds) {
    if (opts.studentIds.length === 0) return [];
    conditions.push(inArray(assignments.studentId, opts.studentIds));
  }

  const assignmentRows = await db
    .select({
      assignment: assignments,
      material: materials,
      studentName: students.name,
    })
    .from(assignments)
    .innerJoin(materials, eq(assignments.materialId, materials.id))
    .innerJoin(students, eq(assignments.studentId, students.id))
    .where(and(...conditions))
    .orderBy(asc(assignments.createdAt));

  if (assignmentRows.length === 0) return [];

  const materialIds = [...new Set(assignmentRows.map((r) => r.material.id))];
  const assignmentIds = assignmentRows.map((r) => r.assignment.id);

  const [unitRows, submissionRows] = await Promise.all([
    db
      .select()
      .from(units)
      .where(inArray(units.materialId, materialIds))
      .orderBy(asc(units.sortOrder)),
    db
      .select()
      .from(submissions)
      .where(inArray(submissions.assignmentId, assignmentIds))
      .orderBy(asc(submissions.sessionNo)),
  ]);

  const submissionIds = submissionRows.map((s) => s.id);
  const gradeRows =
    submissionIds.length > 0
      ? await db
          .select()
          .from(gradings)
          .where(inArray(gradings.submissionId, submissionIds))
          .orderBy(desc(gradings.createdAt))
      : [];

  return assignmentRows.map((row) =>
    summarizeAssignment({
      ...row,
      unitRows: unitRows.filter((u) => u.materialId === row.material.id),
      submissionRows: submissionRows.filter((s) => s.assignmentId === row.assignment.id),
      gradeRows: gradeRows.filter((g) =>
        submissionRows.some((s) => s.assignmentId === row.assignment.id && s.id === g.submissionId),
      ),
    }),
  );
}

export async function getAssignmentProgress(
  organizationId: string,
  assignmentId: string,
): Promise<MaterialProgressRow | null> {
  const rows = await db
    .select({
      assignment: assignments,
      material: materials,
      studentName: students.name,
    })
    .from(assignments)
    .innerJoin(materials, eq(assignments.materialId, materials.id))
    .innerJoin(students, eq(assignments.studentId, students.id))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.organizationId, organizationId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [unitRows, submissionRows] = await Promise.all([
    db
      .select()
      .from(units)
      .where(eq(units.materialId, row.material.id))
      .orderBy(asc(units.sortOrder)),
    db
      .select()
      .from(submissions)
      .where(eq(submissions.assignmentId, row.assignment.id))
      .orderBy(asc(submissions.sessionNo)),
  ]);

  const subIds = submissionRows.map((s) => s.id);
  const gradeRows =
    subIds.length > 0
      ? await db
          .select()
          .from(gradings)
          .where(inArray(gradings.submissionId, subIds))
          .orderBy(desc(gradings.createdAt))
      : [];

  return summarizeAssignment({
    ...row,
    unitRows,
    submissionRows,
    gradeRows,
  });
}

export async function syncAssignmentCompletion(
  organizationId: string,
  assignmentId: string,
): Promise<boolean> {
  const progress = await getAssignmentProgress(organizationId, assignmentId);
  if (!progress) return false;
  if (progress.totalCount === null) return false;

  await db
    .update(assignments)
    .set({ status: progress.isComplete ? "completed" : "active" })
    .where(and(eq(assignments.id, assignmentId), eq(assignments.organizationId, organizationId)));

  return progress.isComplete;
}
