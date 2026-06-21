/**
 * 提出物のステートマシン。
 *
 * 状態:
 *   not_submitted     未提出
 *   submitted         提出済み
 *   grading           採点中
 *   returned          返却済み
 *   resubmit_required 再提出依頼
 *   done              完了
 *
 * 不正な状態変更を防ぐため、状態遷移は必ず assertTransition() を通す。
 * どの遷移を「誰(ロール)」が起こせるかも合わせて定義する。
 */
import type { SubmissionStatus, UserRole } from "@/db/schema";

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  not_submitted: "未提出",
  submitted: "提出済み",
  grading: "採点中",
  returned: "返却済み",
  resubmit_required: "再提出依頼",
  done: "完了",
};

/** バッジ表示用の配色 (Tailwind クラス)。 */
export const SUBMISSION_STATUS_BADGE: Record<SubmissionStatus, string> = {
  not_submitted: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  grading: "bg-amber-100 text-amber-700 border-amber-200",
  returned: "bg-emerald-100 text-emerald-700 border-emerald-200",
  resubmit_required: "bg-rose-100 text-rose-700 border-rose-200",
  done: "bg-violet-100 text-violet-700 border-violet-200",
};

/** どのロールが起点になれるか。student は生徒本人/保護者(代理提出)を含む概念。 */
type Actor = "student_side" | "operator_side";

export interface Transition {
  from: SubmissionStatus;
  to: SubmissionStatus;
  by: Actor;
  /** 人が読むラベル (操作ボタン名など)。 */
  label: string;
}

/** 許可される遷移の唯一の定義。ここに無い from→to はすべて不正。 */
export const ALLOWED_TRANSITIONS: Transition[] = [
  // 生徒・保護者側
  { from: "not_submitted", to: "submitted", by: "student_side", label: "提出する" },
  { from: "resubmit_required", to: "submitted", by: "student_side", label: "再提出する" },
  { from: "returned", to: "done", by: "student_side", label: "確認して完了にする" },
  // 運営者・採点者側
  { from: "submitted", to: "grading", by: "operator_side", label: "採点を開始" },
  { from: "grading", to: "returned", by: "operator_side", label: "採点結果を返却" },
  { from: "grading", to: "resubmit_required", by: "operator_side", label: "再提出を依頼" },
  // 返却後でも運営判断で完了にできる
  { from: "returned", to: "done", by: "operator_side", label: "完了にする" },
];

/** ロールが student_side / operator_side のどちらに属するか。 */
export function actorForRole(role: UserRole): Actor {
  return role === "student" || role === "parent" ? "student_side" : "operator_side";
}

/** その from から、actor が起こせる遷移の一覧。 */
export function availableTransitions(
  from: SubmissionStatus,
  actor: Actor,
): Transition[] {
  return ALLOWED_TRANSITIONS.filter((t) => t.from === from && t.by === actor);
}

export function canTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
  actor: Actor,
): boolean {
  return ALLOWED_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.by === actor,
  );
}

export class InvalidTransitionError extends Error {
  constructor(from: SubmissionStatus, to: SubmissionStatus, actor: Actor) {
    super(
      `不正な状態変更です: ${SUBMISSION_STATUS_LABELS[from]} → ${SUBMISSION_STATUS_LABELS[to]} (${actor})`,
    );
    this.name = "InvalidTransitionError";
  }
}

/** 遷移が許可されているか検証。許可されていなければ例外を投げる。 */
export function assertTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
  actor: Actor,
): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidTransitionError(from, to, actor);
  }
}
