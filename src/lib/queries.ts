/**
 * org スコープの共通読み取りクエリ。
 * すべて organizationId でフィルタする (テナント分離の単一窓口)。
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  gradingMistakes,
  gradings,
  materialFiles,
  materials,
  mistakeTags,
  students,
  submissionEvents,
  submissionImages,
  submissions,
} from "@/db/schema";
import type {
  Grading,
  MistakeTag,
  SubmissionImage,
  SubmissionStatus,
} from "@/db/schema";

export interface SubmissionRow {
  submissionId: string;
  status: SubmissionStatus;
  attemptCount: number;
  submittedAt: Date | null;
  returnedAt: Date | null;
  updatedAt: Date;
  sessionNo: number;
  studentId: string;
  studentName: string;
  studentGrade: string;
  assignmentId: string;
  assignmentTitle: string;
  rangeText: string;
  dueDate: Date | null;
  materialName: string;
  subject: string;
}

/** org の提出物一覧 (任意で状態/生徒で絞り込み)。 */
export async function listSubmissions(
  organizationId: string,
  opts: { statuses?: SubmissionStatus[]; studentIds?: string[] } = {},
): Promise<SubmissionRow[]> {
  const conditions = [eq(submissions.organizationId, organizationId)];
  if (opts.statuses && opts.statuses.length > 0) {
    conditions.push(inArray(submissions.status, opts.statuses));
  }
  if (opts.studentIds) {
    if (opts.studentIds.length === 0) return [];
    conditions.push(inArray(submissions.studentId, opts.studentIds));
  }

  const rows = await db
    .select({
      submissionId: submissions.id,
      status: submissions.status,
      attemptCount: submissions.attemptCount,
      submittedAt: submissions.submittedAt,
      returnedAt: submissions.returnedAt,
      updatedAt: submissions.updatedAt,
      sessionNo: submissions.sessionNo,
      studentId: students.id,
      studentName: students.name,
      studentGrade: students.grade,
      assignmentId: assignments.id,
      assignmentTitle: assignments.title,
      rangeText: submissions.rangeText,
      dueDate: assignments.dueDate,
      materialName: materials.name,
      subject: materials.subject,
    })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(students, eq(submissions.studentId, students.id))
    .innerJoin(materials, eq(assignments.materialId, materials.id))
    .where(and(...conditions))
    .orderBy(desc(submissions.updatedAt));

  return rows;
}

/** 状態別の件数。 */
export async function countByStatus(
  organizationId: string,
): Promise<Record<SubmissionStatus, number>> {
  const rows = await db
    .select({ status: submissions.status })
    .from(submissions)
    .where(eq(submissions.organizationId, organizationId));

  const counts: Record<SubmissionStatus, number> = {
    not_submitted: 0,
    submitted: 0,
    grading: 0,
    returned: 0,
    resubmit_required: 0,
    done: 0,
  };
  for (const r of rows) counts[r.status]++;
  return counts;
}

export interface SubmissionDetail {
  submission: typeof submissions.$inferSelect;
  assignment: typeof assignments.$inferSelect;
  student: typeof students.$inferSelect;
  material: typeof materials.$inferSelect;
  materialFiles: (typeof materialFiles.$inferSelect)[];
  images: SubmissionImage[];
  gradings: (Grading & { mistakes: MistakeTag[] })[];
  events: (typeof submissionEvents.$inferSelect)[];
}

/** 提出物の詳細を org スコープで取得。見つからなければ null。 */
export async function getSubmissionDetail(
  organizationId: string,
  submissionId: string,
): Promise<SubmissionDetail | null> {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!sub) return null;

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, sub.assignmentId))
    .limit(1);
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.id, sub.studentId))
    .limit(1);
  const [material] = await db
    .select()
    .from(materials)
    .where(eq(materials.id, assignment.materialId))
    .limit(1);

  const matFiles = await db
    .select()
    .from(materialFiles)
    .where(eq(materialFiles.materialId, assignment.materialId));

  const images = await db
    .select()
    .from(submissionImages)
    .where(eq(submissionImages.submissionId, sub.id))
    .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder));

  const gradeRows = await db
    .select()
    .from(gradings)
    .where(eq(gradings.submissionId, sub.id))
    .orderBy(desc(gradings.createdAt));

  // 各採点に紐づくミス分類をまとめる
  const gradeIds = gradeRows.map((g) => g.id);
  const mistakeLinks =
    gradeIds.length > 0
      ? await db
          .select({
            gradingId: gradingMistakes.gradingId,
            tag: mistakeTags,
          })
          .from(gradingMistakes)
          .innerJoin(
            mistakeTags,
            eq(gradingMistakes.mistakeTagId, mistakeTags.id),
          )
          .where(inArray(gradingMistakes.gradingId, gradeIds))
      : [];

  const gradingsWithMistakes = gradeRows.map((g) => ({
    ...g,
    mistakes: mistakeLinks.filter((m) => m.gradingId === g.id).map((m) => m.tag),
  }));

  const events = await db
    .select()
    .from(submissionEvents)
    .where(eq(submissionEvents.submissionId, sub.id))
    .orderBy(desc(submissionEvents.createdAt));

  return {
    submission: sub,
    assignment,
    student,
    material,
    materialFiles: matFiles,
    images,
    gradings: gradingsWithMistakes,
    events,
  };
}

export interface HistoryRow {
  gradingId: string;
  createdAt: Date;
  score: string | null;
  maxScore: string | null;
  result: "ok" | "ng" | null;
  comment: string;
  requiresResubmit: boolean;
  attemptNo: number;
  submissionId: string;
  sessionNo: number;
  rangeText: string;
  assignmentTitle: string;
  materialName: string;
  subject: string;
  studentId: string;
  studentName: string;
}

/** 採点(返却)履歴。生徒の成績・学習履歴表示に使う。新しい順。 */
export async function listGradingHistory(
  organizationId: string,
  opts: { studentIds?: string[] } = {},
): Promise<HistoryRow[]> {
  const conditions = [eq(gradings.organizationId, organizationId)];
  if (opts.studentIds) {
    if (opts.studentIds.length === 0) return [];
    conditions.push(inArray(submissions.studentId, opts.studentIds));
  }

  return db
    .select({
      gradingId: gradings.id,
      createdAt: gradings.createdAt,
      score: gradings.score,
      maxScore: gradings.maxScore,
      result: gradings.result,
      comment: gradings.comment,
      requiresResubmit: gradings.requiresResubmit,
      attemptNo: gradings.attemptNo,
      submissionId: submissions.id,
      sessionNo: submissions.sessionNo,
      rangeText: submissions.rangeText,
      assignmentTitle: assignments.title,
      materialName: materials.name,
      subject: materials.subject,
      studentId: students.id,
      studentName: students.name,
    })
    .from(gradings)
    .innerJoin(submissions, eq(gradings.submissionId, submissions.id))
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(materials, eq(assignments.materialId, materials.id))
    .innerJoin(students, eq(submissions.studentId, students.id))
    .where(and(...conditions))
    .orderBy(desc(gradings.createdAt));
}

/** org のミス分類マスタ。 */
export async function listMistakeTags(
  organizationId: string,
): Promise<MistakeTag[]> {
  return db
    .select()
    .from(mistakeTags)
    .where(eq(mistakeTags.organizationId, organizationId))
    .orderBy(asc(mistakeTags.sortOrder));
}
