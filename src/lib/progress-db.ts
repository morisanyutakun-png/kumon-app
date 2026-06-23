/**
 * 進度エンジン (src/lib/progress.ts) と DB 行の橋渡し。
 * DB の materials/units/assignments 行を純粋関数が扱う型へ変換するヘルパー群。
 */
import type { Material, Unit } from "@/db/schema";
import {
  advanceOnPass,
  COMPLETED_LABEL,
  currentRangeLabel,
  nextRangeLabel,
  sessionPlan,
  totalItems,
  type AdvanceResult,
  type AssignmentProgress,
  type MaterialInfo,
  type UnitInfo,
} from "@/lib/progress";

export function toMaterialInfo(m: Material): MaterialInfo {
  return {
    progressType: m.progressType,
    numberStart: m.numberStart,
    numberEnd: m.numberEnd,
    completionAction: m.completionAction,
  };
}

export function toUnitInfos(rows: Unit[]): UnitInfo[] {
  return rows.map((u) => ({ title: u.title, rangeText: u.rangeText }));
}

export function isAutoAdvance(m: Material): boolean {
  return m.progressType !== "manual";
}

/** 新規割当 (progress=0) の初回セッション範囲ラベル。manual は '' (=割当の手入力範囲を使う)。 */
export function initialSessionRange(
  m: Material,
  unitRows: Unit[],
  unitsPerSession: number,
): string {
  if (!isAutoAdvance(m)) return "";
  const a: AssignmentProgress = {
    progressIndex: 0,
    unitsPerSession: Math.max(1, unitsPerSession),
    unitsPerSessionPending: null,
    pointer: 1,
    reviewEnabled: true,
  };
  return currentRangeLabel(a, toMaterialInfo(m), toUnitInfos(unitRows)) ?? "";
}

/** assignment 行 + material/units から、合格1回ぶん前進した結果と次セッション範囲を返す。 */
export function planAdvance(
  assignment: {
    progressIndex: number;
    unitsPerSession: number;
    pointer: number;
  },
  m: Material,
  unitRows: Unit[],
): { advance: AdvanceResult; nextRange: string | null } {
  const mat = toMaterialInfo(m);
  const us = toUnitInfos(unitRows);
  const a: AssignmentProgress = {
    progressIndex: assignment.progressIndex,
    unitsPerSession: Math.max(1, assignment.unitsPerSession),
    unitsPerSessionPending: null,
    pointer: assignment.pointer,
    reviewEnabled: true,
  };
  const advance = advanceOnPass(a, mat, us);

  // 前進後の状態で次セッションの範囲を求める
  const advancedA: AssignmentProgress = {
    progressIndex: advance.progressIndex,
    unitsPerSession: advance.unitsPerSession,
    unitsPerSessionPending: null,
    pointer: advance.pointer,
    reviewEnabled: true,
  };
  const plan = sessionPlan(advancedA, mat, us);
  // delete 完了で次が無い場合は null
  const nextRange =
    advance.status === "completed" || plan.current === "完了"
      ? null
      : plan.current;

  return { advance, nextRange };
}

/**
 * 採点画面で「次回の割り当て範囲」を提示・調整するためのデータ。
 * 合格で自動進行した既定の範囲(startIdx/count)と、±調整に必要なラベル群を返す。
 */
export interface NextWindow {
  track: "number" | "chapter" | "manual";
  labels: string[]; // chapter: 単元タイトル / それ以外は []
  numberStart: number; // number: 開始番号
  maxIdx: number; // 選べる最後のインデックス(0始まり)。-1=なし
  startIdx: number; // 既定の次回開始(絶対インデックス)
  count: number; // 既定のペース(項目数)
  label: string; // 既定の次回範囲ラベル
  fixed: boolean; // 完了/総復習 → ±不可
  completed: boolean; // 次回が無い(完了)
}

export function nextWindow(
  assignment: { progressIndex: number; unitsPerSession: number; pointer: number },
  m: Material,
  unitRows: Unit[],
): NextWindow {
  const mat = toMaterialInfo(m);
  const us = toUnitInfos(unitRows);
  const per = Math.max(1, assignment.unitsPerSession);
  const total = totalItems(mat, us);
  const startIdx = assignment.progressIndex + per;

  if (m.progressType === "manual") {
    return { track: "manual", labels: [], numberStart: 0, maxIdx: -1, startIdx: 0, count: 1, label: "", fixed: false, completed: false };
  }

  // 完了 / 総復習 (これ以上の通常進行なし)
  if (total > 0 && startIdx >= total) {
    const a0: AssignmentProgress = {
      progressIndex: assignment.progressIndex,
      unitsPerSession: per,
      unitsPerSessionPending: null,
      pointer: assignment.pointer,
      reviewEnabled: true,
    };
    const lbl = nextRangeLabel(a0, mat, us);
    return {
      track: m.progressType === "number" ? "number" : "chapter",
      labels: m.progressType === "number" ? [] : us.map((u) => u.title),
      numberStart: m.numberStart ?? 0,
      maxIdx: total - 1,
      startIdx,
      count: per,
      label: lbl,
      fixed: true,
      completed: lbl === COMPLETED_LABEL,
    };
  }

  const a2: AssignmentProgress = {
    progressIndex: startIdx,
    unitsPerSession: per,
    unitsPerSessionPending: null,
    pointer: assignment.pointer + 1,
    reviewEnabled: true,
  };
  const label = currentRangeLabel(a2, mat, us) ?? COMPLETED_LABEL;

  return {
    track: m.progressType === "number" ? "number" : "chapter",
    labels: m.progressType === "number" ? [] : us.map((u) => u.title),
    numberStart: m.numberStart ?? 0,
    maxIdx: total - 1,
    startIdx,
    count: per,
    label,
    fixed: false,
    completed: false,
  };
}

/** startIdx/count(±調整後) から、その教材の範囲ラベルを求める。 */
export function rangeLabelAt(
  m: Material,
  unitRows: Unit[],
  startIdx: number,
  count: number,
): string {
  const a: AssignmentProgress = {
    progressIndex: startIdx,
    unitsPerSession: Math.max(1, count),
    unitsPerSessionPending: null,
    pointer: 1,
    reviewEnabled: true,
  };
  return currentRangeLabel(a, toMaterialInfo(m), toUnitInfos(unitRows)) ?? COMPLETED_LABEL;
}
