"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { asc } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  gradingMistakes,
  gradings,
  materials,
  submissionEvents,
  submissionImages,
  submissions,
  units,
} from "@/db/schema";
import type { Submission, SubmissionStatus } from "@/db/schema";
import { getPrincipal, isOperator } from "@/lib/access";
import type { Principal } from "@/auth";
import { saveBlob } from "@/lib/blob";
import { isAutoAdvance, planAdvance } from "@/lib/progress-db";
import {
  actorForRole,
  assertTransition,
} from "@/lib/submission-state";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

class ActionError extends Error {}

/**
 * 提出物を org スコープ + アクセス権込みで取得。権限がなければ例外。
 * 生徒・保護者は自分が閲覧できる生徒の提出物のみ。
 */
async function loadSubmission(
  p: Principal,
  submissionId: string,
): Promise<Submission> {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.organizationId, p.organizationId),
      ),
    )
    .limit(1);
  if (!sub) throw new ActionError("提出物が見つかりません。");

  if (!isOperator(p)) {
    // 生徒・保護者: 自分(が見られる生徒)の提出物か
    const { canAccessStudent } = await import("@/lib/access");
    const ok = await canAccessStudent(p, sub.studentId);
    if (!ok) throw new ActionError("この提出物へのアクセス権がありません。");
  }
  return sub;
}

/** status 更新 + 遷移ログを 1 トランザクションで。不正遷移は assertTransition が阻止。 */
async function applyTransition(
  p: Principal,
  sub: Submission,
  to: SubmissionStatus,
  note = "",
  extra: Partial<typeof submissions.$inferInsert> = {},
) {
  const actor = actorForRole(p.role);
  assertTransition(sub.status, to, actor);

  await db.transaction(async (tx) => {
    await tx
      .update(submissions)
      .set({ status: to, updatedAt: new Date(), ...extra })
      .where(eq(submissions.id, sub.id));
    await tx.insert(submissionEvents).values({
      organizationId: sub.organizationId,
      submissionId: sub.id,
      fromStatus: sub.status,
      toStatus: to,
      byUserId: p.role === "student" ? null : p.id,
      note,
    });
  });
}

function revalidateAll(submissionId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/grading");
  revalidatePath(`/grading/${submissionId}`);
  revalidatePath("/home");
  revalidatePath(`/submissions/${submissionId}`);
}

// =============================================================================
// 生徒・保護者: 答案提出 / 再提出
// =============================================================================

export async function submitAnswer(submissionId: string, formData: FormData) {
  const p = await getPrincipal();
  if (!p) throw new ActionError("ログインが必要です。");
  const sub = await loadSubmission(p, submissionId);

  if (sub.status !== "not_submitted" && sub.status !== "resubmit_required") {
    throw new ActionError("この課題は現在提出できる状態ではありません。");
  }

  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new ActionError("答案画像を1枚以上選んでください。");
  }

  const attemptNo = sub.attemptCount + 1;
  let sortOrder = 0;
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new ActionError(`未対応の画像形式です: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ActionError("画像サイズが大きすぎます (15MBまで)。");
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const pathname = `${sub.organizationId}/submissions/${sub.id}/${attemptNo}/${sortOrder}-${safeName}`;
    const stored = await saveBlob(pathname, buf, file.type);
    await db.insert(submissionImages).values({
      organizationId: sub.organizationId,
      submissionId: sub.id,
      attemptNo,
      sortOrder,
      blobUrl: stored.url,
      pathname: stored.pathname,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
    sortOrder++;
  }

  await applyTransition(p, sub, "submitted", "答案を提出", {
    attemptCount: attemptNo,
    submittedAt: new Date(),
  });
  revalidateAll(submissionId);
}

// =============================================================================
// 生徒・保護者: 返却内容を確認して完了
// =============================================================================

export async function confirmReturned(submissionId: string) {
  const p = await getPrincipal();
  if (!p) throw new ActionError("ログインが必要です。");
  const sub = await loadSubmission(p, submissionId);
  await applyTransition(p, sub, "done", "結果を確認");
  revalidateAll(submissionId);
}

// =============================================================================
// 運営・採点者
// =============================================================================

export async function startGrading(submissionId: string) {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");
  const sub = await loadSubmission(p, submissionId);
  await applyTransition(p, sub, "grading", "採点を開始");
  revalidateAll(submissionId);
}

export async function completeSubmission(submissionId: string) {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");
  const sub = await loadSubmission(p, submissionId);
  await applyTransition(p, sub, "done", "完了にする");
  revalidateAll(submissionId);
}

/**
 * 採点を記録し、返却 または 再提出依頼に遷移する。
 * mode = "return"   → grading→returned
 * mode = "resubmit" → grading→resubmit_required
 */
export async function gradeSubmission(submissionId: string, formData: FormData) {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");
  const sub = await loadSubmission(p, submissionId);
  if (sub.status !== "grading") {
    throw new ActionError("採点中の提出物のみ採点できます。先に採点を開始してください。");
  }

  const mode = String(formData.get("mode") ?? "return");
  const scoreRaw = String(formData.get("score") ?? "").trim();
  const maxScoreRaw = String(formData.get("maxScore") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim(); // "ok" | "ng" | ""
  const comment = String(formData.get("comment") ?? "").trim();
  const mistakeTagIds = formData
    .getAll("mistakeTagIds")
    .map((v) => String(v))
    .filter(Boolean);

  const requiresResubmit = mode === "resubmit";

  await db.transaction(async (tx) => {
    const [grading] = await tx
      .insert(gradings)
      .values({
        organizationId: sub.organizationId,
        submissionId: sub.id,
        attemptNo: sub.attemptCount,
        graderId: p.id,
        score: scoreRaw === "" ? null : scoreRaw,
        maxScore: maxScoreRaw === "" ? null : maxScoreRaw,
        result: result === "ok" || result === "ng" ? result : null,
        comment,
        requiresResubmit,
      })
      .returning();

    if (mistakeTagIds.length > 0) {
      await tx.insert(gradingMistakes).values(
        mistakeTagIds.map((tagId) => ({
          gradingId: grading.id,
          mistakeTagId: tagId,
        })),
      );
    }
  });

  const to: SubmissionStatus = requiresResubmit
    ? "resubmit_required"
    : "returned";
  await applyTransition(
    p,
    sub,
    to,
    requiresResubmit ? "再提出を依頼" : "採点結果を返却",
    to === "returned" ? { returnedAt: new Date() } : {},
  );

  // 合格して返却した場合のみ、進度を1つ前進させ次セッションを自動生成する。
  if (!requiresResubmit && result === "ok") {
    await advanceProgressAfterPass(sub);
  }

  revalidateAll(submissionId);
}

/**
 * 合格返却後の進度前進。割当を1つ進め、次の範囲があれば新しい提出物(未提出)を作る。
 * 手入力(manual)教材は自動進行しない。
 */
async function advanceProgressAfterPass(sub: Submission) {
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, sub.assignmentId))
    .limit(1);
  if (!assignment) return;

  const [material] = await db
    .select()
    .from(materials)
    .where(eq(materials.id, assignment.materialId))
    .limit(1);
  if (!material || !isAutoAdvance(material)) return;

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.materialId, assignment.materialId))
    .orderBy(asc(units.sortOrder));

  const { advance, nextRange } = planAdvance(assignment, material, unitRows);

  await db.transaction(async (tx) => {
    await tx
      .update(assignments)
      .set({
        progressIndex: advance.progressIndex,
        unitsPerSession: advance.unitsPerSession,
        pointer: advance.pointer,
        status: advance.status === "completed" ? "completed" : "active",
      })
      .where(eq(assignments.id, assignment.id));

    if (nextRange !== null) {
      await tx.insert(submissions).values({
        organizationId: sub.organizationId,
        assignmentId: assignment.id,
        studentId: sub.studentId,
        status: "not_submitted",
        sessionNo: advance.pointer,
        rangeText: nextRange,
      });
    }
  });
}
