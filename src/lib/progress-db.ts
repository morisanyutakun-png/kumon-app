/**
 * 進度エンジン (src/lib/progress.ts) と DB 行の橋渡し。
 * DB の materials/units/assignments 行を純粋関数が扱う型へ変換するヘルパー群。
 */
import type { Material, Unit } from "@/db/schema";
import {
  advanceOnPass,
  currentRangeLabel,
  sessionPlan,
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
