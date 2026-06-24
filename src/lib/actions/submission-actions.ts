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
  notifications,
  submissionEvents,
  submissionImages,
  submissions,
  units,
} from "@/db/schema";
import type { Submission, SubmissionStatus } from "@/db/schema";
import { getPrincipal, isOperator } from "@/lib/access";
import type { Principal } from "@/auth";
import { saveFile } from "@/lib/blob";
import { validateScorePair } from "@/lib/grading-validation";
import { isAutoAdvance, planAdvance, rangeLabelAt } from "@/lib/progress-db";
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
    const stored = await saveFile(pathname, buf, file.type);
    await db.insert(submissionImages).values({
      organizationId: sub.organizationId,
      submissionId: sub.id,
      attemptNo,
      sortOrder,
      blobUrl: stored.blobUrl,
      pathname: stored.pathname,
      dataB64: stored.dataB64,
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

export interface BatchGradeItem {
  submissionId: string;
  score?: string;
  maxScore?: string;
  /** "ok" 合格 / "ng" やり直し / "skip" 未実施。 */
  result?: "ok" | "ng" | "skip" | "";
  comment?: string;
  /** "return" 返却 / "resubmit" 再提出依頼。 */
  mode: "return" | "resubmit";
  /**
   * 合格返却時の「次回割り当て」を上書き指定(採点画面で±調整した場合)。
   * 自動進行教材: startIdx/count を指定 / 手入力教材: label を指定。
   */
  next?: { startIdx?: number; count?: number; label?: string };
}

/**
 * Excel 風の一括採点。提出済み(または採点中)の複数提出物をまとめて採点・返却する。
 * 各行ごとに 提出済み→採点中→返却/再提出 と正しく遷移し、合格返却なら進度を前進。
 * 戻り値は処理件数とスキップ件数。
 */
export async function batchGrade(
  items: BatchGradeItem[],
): Promise<{ processed: number; skipped: number }> {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");

  let processed = 0;
  let skipped = 0;

  for (const it of items) {
    const sub = await loadSubmission(p, it.submissionId);
    if (sub.status !== "submitted" && sub.status !== "grading") {
      skipped++;
      continue;
    }

    // 提出済みならまず採点中へ。
    let current = sub;
    if (current.status === "submitted") {
      await applyTransition(p, current, "grading", "採点を開始(一括)");
      current = { ...current, status: "grading" };
    }

    const result =
      it.result === "ok" || it.result === "ng" || it.result === "skip"
        ? it.result
        : null;
    // 未実施は再提出を求めず、得点も持たない。やり直し(ng)は再提出依頼。
    const requiresResubmit = it.mode === "resubmit" && result !== "skip";
    // 未実施は得点・満点を無視して空に揃える (PHP の挙動を踏襲)。
    const score = result === "skip" ? "" : (it.score ?? "").trim();
    const maxScore = result === "skip" ? "" : (it.maxScore ?? "").trim();

    // 入力仕様の検証 (得点を入れたら満点必須・得点≤満点・満点>0)。
    validateScorePair(score, maxScore, `提出 ${current.id.slice(0, 8)}`);

    await db.insert(gradings).values({
      organizationId: current.organizationId,
      submissionId: current.id,
      attemptNo: current.attemptCount,
      graderId: p.id,
      score: score === "" ? null : score,
      maxScore: maxScore === "" ? null : maxScore,
      result,
      comment: (it.comment ?? "").trim(),
      requiresResubmit,
    });

    const to: SubmissionStatus = requiresResubmit
      ? "resubmit_required"
      : "returned";
    await applyTransition(
      p,
      current,
      to,
      requiresResubmit ? "再提出を依頼(一括)" : "採点結果を返却(一括)",
      to === "returned" ? { returnedAt: new Date() } : {},
    );

    // 合格返却のみ進度を前進。未実施(skip)・やり直しは前進しない。
    if (!requiresResubmit && result === "ok") {
      if (it.next) await advanceWithNext(current, it.next);
      else await advanceProgressAfterPass(current);
    }
    processed++;
  }

  revalidatePath("/grading");
  revalidatePath("/grading/batch");
  revalidatePath("/dashboard");
  revalidatePath("/home");
  return { processed, skipped };
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

/**
 * 採点画面で±調整した「次回割り当て」で進度を更新し、次セッション(未提出)を作る。
 * 自動進行教材: next.startIdx/count を採用(progressIndex=startIdx, pace=count)。
 * 手入力教材: next.label を次回範囲として割り当てる。
 */
async function advanceWithNext(
  sub: Submission,
  next: { startIdx?: number; count?: number; label?: string },
) {
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
  if (!material) return;

  const nextPointer = assignment.pointer + 1;

  // 手入力教材: ラベルをそのまま次回範囲に。
  if (!isAutoAdvance(material)) {
    const label = (next.label ?? "").trim();
    await db.transaction(async (tx) => {
      await tx.update(assignments).set({ pointer: nextPointer }).where(eq(assignments.id, assignment.id));
      if (label) {
        await tx.insert(submissions).values({
          organizationId: sub.organizationId,
          assignmentId: assignment.id,
          studentId: sub.studentId,
          status: "not_submitted",
          sessionNo: nextPointer,
          rangeText: label,
        });
      }
    });
    return;
  }

  // 自動進行教材: startIdx/count が無ければ既定の自動進行に委譲。
  if (typeof next.startIdx !== "number" || typeof next.count !== "number") {
    await advanceProgressAfterPass(sub);
    return;
  }

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.materialId, assignment.materialId))
    .orderBy(asc(units.sortOrder));

  const startIdx = Math.max(0, next.startIdx);
  const count = Math.max(1, next.count);
  const label = rangeLabelAt(material, unitRows, startIdx, count);
  const completed = label === "完了";

  await db.transaction(async (tx) => {
    await tx
      .update(assignments)
      .set({
        progressIndex: startIdx,
        unitsPerSession: count,
        pointer: nextPointer,
        status: completed ? "completed" : "active",
      })
      .where(eq(assignments.id, assignment.id));

    if (!completed) {
      await tx.insert(submissions).values({
        organizationId: sub.organizationId,
        assignmentId: assignment.id,
        studentId: sub.studentId,
        status: "not_submitted",
        sessionNo: nextPointer,
        rangeText: label,
      });
    }
  });
}

// =============================================================================
// タブレット/デスクトップ採点ビュー: 下書き保存 / 返却 / 再提出依頼 / 既読
// =============================================================================

const DRAFT_CLEARED = {
  draftScore: null,
  draftMaxScore: null,
  draftResult: null,
  draftComment: "",
  draftNextRange: "",
  draftGraderId: null,
  draftUpdatedAt: null,
} as const;

/** 提出済みなら採点中へ遷移させて現在の submission を返す。 */
async function ensureGrading(p: Principal, sub: Submission): Promise<Submission> {
  if (sub.status === "submitted") {
    await applyTransition(p, sub, "grading", "採点を開始");
    return { ...sub, status: "grading" };
  }
  return sub;
}

/** 採点の下書きを保存 (返却せず一旦保存)。タブレットでの「完了」に相当。 */
export async function saveGradingDraft(submissionId: string, formData: FormData) {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");
  const sub = await loadSubmission(p, submissionId);
  if (sub.status !== "submitted" && sub.status !== "grading") {
    throw new ActionError("採点できる状態ではありません。");
  }
  const cur = await ensureGrading(p, sub);

  const score = String(formData.get("score") ?? "").trim();
  const maxScore = String(formData.get("maxScore") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const nextRange = String(formData.get("nextRange") ?? "").trim();

  await db
    .update(submissions)
    .set({
      draftScore: score === "" ? null : score,
      draftMaxScore: maxScore === "" ? null : maxScore,
      draftResult: result === "ok" || result === "ng" ? result : null,
      draftComment: comment,
      draftNextRange: nextRange,
      draftGraderId: p.id,
      draftUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, cur.id));

  revalidateAll(submissionId);
}

/**
 * 採点を確定して返却。採点結果(得点/合否/コメント) + 次回範囲を入力して実行する。
 * 返却時に生徒のダッシュボードへ「お知らせ(添付つきメッセージ)」を作成する。
 */
export async function returnGrading(submissionId: string, formData: FormData) {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");
  const sub = await loadSubmission(p, submissionId);
  if (sub.status !== "submitted" && sub.status !== "grading") {
    throw new ActionError("採点できる状態ではありません。");
  }
  const cur = await ensureGrading(p, sub);

  const score = String(formData.get("score") ?? "").trim();
  const maxScore = String(formData.get("maxScore") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const nextRange = String(formData.get("nextRange") ?? "").trim();
  const mistakeTagIds = formData
    .getAll("mistakeTagIds")
    .map((v) => String(v))
    .filter(Boolean);

  await db.transaction(async (tx) => {
    const [grading] = await tx
      .insert(gradings)
      .values({
        organizationId: cur.organizationId,
        submissionId: cur.id,
        attemptNo: cur.attemptCount,
        graderId: p.id,
        score: score === "" ? null : score,
        maxScore: maxScore === "" ? null : maxScore,
        result: result === "ok" || result === "ng" ? result : null,
        comment,
        requiresResubmit: false,
      })
      .returning();
    if (mistakeTagIds.length > 0) {
      await tx.insert(gradingMistakes).values(
        mistakeTagIds.map((tagId) => ({ gradingId: grading.id, mistakeTagId: tagId })),
      );
    }
    await tx.update(submissions).set(DRAFT_CLEARED).where(eq(submissions.id, cur.id));
  });

  await applyTransition(p, cur, "returned", "採点結果を返却", {
    returnedAt: new Date(),
  });

  // 生徒ダッシュボードへの通知
  await db.insert(notifications).values({
    organizationId: cur.organizationId,
    studentId: cur.studentId,
    submissionId: cur.id,
    type: "returned",
    title: "採点結果が返却されました",
    body: comment,
  });

  // 次回セッションの作成
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, cur.assignmentId))
    .limit(1);
  const [material] = assignment
    ? await db.select().from(materials).where(eq(materials.id, assignment.materialId)).limit(1)
    : [undefined];

  if (assignment && material && isAutoAdvance(material) && result === "ok") {
    // 章/番号: エンジンで自動前進 (次セッション自動生成)
    await advanceProgressAfterPass(cur);
  } else if (assignment && nextRange) {
    // 手入力など: 入力された次回範囲で次セッションを作成
    await db.insert(submissions).values({
      organizationId: cur.organizationId,
      assignmentId: cur.assignmentId,
      studentId: cur.studentId,
      status: "not_submitted",
      sessionNo: cur.sessionNo + 1,
      rangeText: nextRange,
    });
  }

  revalidateAll(submissionId);
}

/** 再提出を依頼。コメントを添えて生徒へ通知する。 */
export async function requestResubmit(submissionId: string, formData: FormData) {
  const p = await getPrincipal();
  if (!p || !isOperator(p)) throw new ActionError("権限がありません。");
  const sub = await loadSubmission(p, submissionId);
  if (sub.status !== "submitted" && sub.status !== "grading") {
    throw new ActionError("採点できる状態ではありません。");
  }
  const cur = await ensureGrading(p, sub);
  const comment = String(formData.get("comment") ?? "").trim();

  await db.transaction(async (tx) => {
    await tx.insert(gradings).values({
      organizationId: cur.organizationId,
      submissionId: cur.id,
      attemptNo: cur.attemptCount,
      graderId: p.id,
      comment,
      requiresResubmit: true,
    });
    await tx.update(submissions).set(DRAFT_CLEARED).where(eq(submissions.id, cur.id));
  });

  await applyTransition(p, cur, "resubmit_required", "再提出を依頼");

  await db.insert(notifications).values({
    organizationId: cur.organizationId,
    studentId: cur.studentId,
    submissionId: cur.id,
    type: "resubmit",
    title: "再提出のお願いがあります",
    body: comment,
  });

  revalidateAll(submissionId);
}

/** 生徒・保護者がその提出物のお知らせを既読にする。 */
export async function markSubmissionRead(submissionId: string) {
  const p = await getPrincipal();
  if (!p) return;
  const sub = await loadSubmission(p, submissionId);
  const { canAccessStudent } = await import("@/lib/access");
  if (!isOperator(p) && !(await canAccessStudent(p, sub.studentId))) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.submissionId, submissionId),
        eq(notifications.organizationId, p.organizationId),
      ),
    );
}
