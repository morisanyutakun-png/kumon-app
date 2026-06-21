/**
 * 学習進度の自動前進エンジン (既存 PHP `app/domain.php` の中核を TypeScript へ移植)。
 *
 * 進度モデル:
 *   - progressIndex : 消費済み項目の絶対数 (0始まり)
 *   - unitsPerSession: 1回あたりに進める項目数 (ペース)
 *   - pointer       : 表示用の回数カウンタ (1始まり)
 *
 * トラック種別:
 *   - chapter / etore: units(単元) ベース。chunk = units[progress .. progress+per-1]
 *   - number         : 数値範囲ベース。chunk = [numberStart+progress, ...]
 *   - manual         : 範囲は毎回手入力 (自動計算しない。pointer のみ進む)
 *
 * 合格(OK)で progressIndex がペース分前進。完了時は completionAction により
 *   - delete     : 割当を完了 (completed)
 *   - review_loop: 全範囲の「総復習」を反復 (totalReview)
 *
 * ※ 既存 PHP の「教材ミックス(2教材交互)」と eトレのバッチ列連携は本移植では未対応。
 *   eトレは「復習なし・単一列」として chapter と同様に扱う。
 */

export type ProgressType = "chapter" | "number" | "etore" | "manual";
export type CompletionAction = "delete" | "review_loop";

export const TOTAL_REVIEW_LABEL = "総復習";
export const COMPLETED_LABEL = "完了";

export interface MaterialInfo {
  progressType: ProgressType;
  numberStart: number | null;
  numberEnd: number | null;
  completionAction: CompletionAction;
}

export interface UnitInfo {
  title: string;
  rangeText: string;
}

export interface AssignmentProgress {
  progressIndex: number;
  unitsPerSession: number;
  unitsPerSessionPending?: number | null;
  pointer: number;
  /** 復習範囲を出すか (未設定は true)。eトレ等は false。 */
  reviewEnabled?: boolean;
}

export interface AdvanceResult {
  progressIndex: number;
  unitsPerSession: number;
  unitsPerSessionPending: number | null;
  pointer: number;
  status: "active" | "completed";
  /** 総復習ループに入った/継続中。 */
  inTotalReview: boolean;
  /** 教材を一通り終えた (delete なら status=completed)。 */
  finished: boolean;
}

export interface SessionPlan {
  /** 今回の実施範囲ラベル。 */
  current: string;
  /** 今回の復習範囲ラベル (なければ null)。 */
  review: string | null;
  /** 次回の実施範囲ラベル ('完了' / '総復習' を含む)。 */
  next: string;
  /** "3/12 回目" のような進捗表示。 */
  progressLabel: string;
  inTotalReview: boolean;
}

// ---------------------------------------------------------------------------
// 基本ユーティリティ
// ---------------------------------------------------------------------------

const isUnitBased = (m: MaterialInfo) =>
  m.progressType === "chapter" || m.progressType === "etore";
const isNumber = (m: MaterialInfo) => m.progressType === "number";
const isManual = (m: MaterialInfo) => m.progressType === "manual";

function effectivePer(a: AssignmentProgress): number {
  return Math.max(1, a.unitsPerSession || 1);
}

export function numberCount(m: MaterialInfo): number {
  if (!isNumber(m)) return 0;
  const s = m.numberStart ?? 0;
  const e = m.numberEnd ?? 0;
  if (s <= 0 || e < s) return 0;
  return e - s + 1;
}

export function totalItems(m: MaterialInfo, units: UnitInfo[]): number {
  if (isNumber(m)) return numberCount(m);
  if (isUnitBased(m)) return units.length;
  return 0; // manual
}

function numberRangeLabel(start: number, end: number): string {
  return start === end ? String(start) : `${start}-${end}`;
}

function rangeJoinLabel(start: string, end: string): string {
  const a = start.trim();
  const b = end.trim();
  if (a === "") return b;
  if (b === "" || a === b) return a;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return `${a}-${b}`;
  return `${a}~${b}`;
}

/** units[startIdx..endIdx] のタイトルを1つのラベルに結合。 */
function combineUnitTitles(
  units: UnitInfo[],
  startIdx: number,
  endIdx: number,
): string {
  if (startIdx === endIdx) return (units[startIdx]?.title ?? "").trim();
  const ts = (units[startIdx]?.title ?? "").trim();
  const te = (units[endIdx]?.title ?? "").trim();
  if (ts === "") return te;
  if (te === "") return ts;
  if (ts === te) return ts;
  return rangeJoinLabel(ts, te);
}

// ---------------------------------------------------------------------------
// 範囲計算
// ---------------------------------------------------------------------------

/** progressIndex 位置の「実施範囲」ラベル。完了なら null。 */
export function currentRangeLabel(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): string | null {
  if (isManual(m)) return null;
  const total = totalItems(m, units);
  const progress = Math.max(0, a.progressIndex);
  if (total > 0 && progress >= total) return null;
  const per = effectivePer(a);

  if (isNumber(m)) {
    const start = m.numberStart ?? 0;
    const end = m.numberEnd ?? 0;
    if (start <= 0 || end < start) return null;
    const rangeStart = start + progress;
    if (rangeStart > end) return null;
    const rangeEnd = Math.min(end, rangeStart + per - 1);
    return numberRangeLabel(rangeStart, rangeEnd);
  }

  // unit-based
  if (units.length === 0 || progress >= units.length) return null;
  const startIdx = progress;
  const endIdx = Math.min(units.length - 1, startIdx + per - 1);
  return combineUnitTitles(units, startIdx, endIdx);
}

/** [0 .. progress-1] の累積復習ラベル。progress<=0 なら null。 */
export function reviewRangeLabelAt(
  progress: number,
  m: MaterialInfo,
  units: UnitInfo[],
): string | null {
  if (progress <= 0) return null;

  if (isNumber(m)) {
    const start = m.numberStart ?? 0;
    if (start <= 0) return null;
    let end = start + progress - 1;
    const maxEnd = m.numberEnd ?? 0;
    if (maxEnd > 0 && end > maxEnd) end = maxEnd;
    if (end < start) return null;
    return numberRangeLabel(start, end);
  }

  if (units.length === 0) return null;
  const endIdx = Math.min(units.length - 1, progress - 1);
  if (endIdx < 0) return null;
  const first = (units[0]?.title ?? "").trim();
  const last = (units[endIdx]?.title ?? "").trim();
  if (first === "" && last === "") return null;
  if (first === last) return first;
  return rangeJoinLabel(first, last);
}

const reviewEnabled = (a: AssignmentProgress) => a.reviewEnabled !== false;

/** 全範囲を終えて総復習ループに入っているか。 */
export function isInTotalReview(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): boolean {
  if (m.completionAction !== "review_loop") return false;
  if (!reviewEnabled(a)) return false;
  const total = totalItems(m, units);
  return total > 0 && a.progressIndex >= total;
}

/** 今回の復習範囲ラベル (総復習中は重複表示を避けるため null)。 */
export function currentReviewLabel(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): string | null {
  if (isManual(m)) return null;
  if (!reviewEnabled(a)) return null;
  if (isInTotalReview(a, m, units)) return null;
  return reviewRangeLabelAt(a.progressIndex, m, units);
}

/** 次回 OK 後に実施される範囲のラベル ('完了' / '総復習' を含む)。 */
export function nextRangeLabel(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): string {
  if (isManual(m)) return "";
  if (isInTotalReview(a, m, units)) return TOTAL_REVIEW_LABEL;

  const oldPer = effectivePer(a);
  const pending = a.unitsPerSessionPending ?? 0;
  const total = totalItems(m, units);
  const newProgress = a.progressIndex + oldPer;
  const newPer = pending > 0 && pending !== oldPer ? pending : oldPer;

  if (total > 0 && newProgress >= total) {
    return m.completionAction === "review_loop" && reviewEnabled(a)
      ? TOTAL_REVIEW_LABEL
      : COMPLETED_LABEL;
  }

  const next: AssignmentProgress = {
    ...a,
    progressIndex: newProgress,
    unitsPerSession: newPer,
    unitsPerSessionPending: null,
    pointer: a.pointer + 1,
  };
  return currentRangeLabel(next, m, units) ?? COMPLETED_LABEL;
}

/** 推定総回数 = ceil(totalItems / per)。 */
export function totalSessions(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): number {
  const total = totalItems(m, units);
  if (total <= 0) return 0;
  return Math.ceil(total / effectivePer(a));
}

export function progressLabel(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): string {
  if (isInTotalReview(a, m, units)) return "総復習中";
  const total = totalSessions(a, m, units);
  return total <= 0 ? `${a.pointer}/0 回目` : `${a.pointer}/${total} 回目`;
}

/** 今回のセッション計画 (表示用)。 */
export function sessionPlan(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): SessionPlan {
  const inLoop = isInTotalReview(a, m, units);
  return {
    current: inLoop
      ? TOTAL_REVIEW_LABEL
      : currentRangeLabel(a, m, units) ?? COMPLETED_LABEL,
    review: currentReviewLabel(a, m, units),
    next: nextRangeLabel(a, m, units),
    progressLabel: progressLabel(a, m, units),
    inTotalReview: inLoop,
  };
}

// ---------------------------------------------------------------------------
// 前進
// ---------------------------------------------------------------------------

/**
 * 合格(OK)1回ぶん進めた後の進度を計算する (純関数)。
 * 不合格・再テストでは呼ばず、進度据え置き。
 */
export function advanceOnPass(
  a: AssignmentProgress,
  m: MaterialInfo,
  units: UnitInfo[],
): AdvanceResult {
  // manual: 範囲自動計算なし。pointer だけ進む。
  if (isManual(m)) {
    return {
      progressIndex: a.progressIndex,
      unitsPerSession: a.unitsPerSession,
      unitsPerSessionPending: null,
      pointer: a.pointer + 1,
      status: "active",
      inTotalReview: false,
      finished: false,
    };
  }

  const total = totalItems(m, units);
  const oldPer = effectivePer(a);
  const pending = a.unitsPerSessionPending ?? 0;
  const newPer = pending > 0 && pending !== oldPer ? pending : oldPer;

  // すでに総復習ループ中: progress は total に張り付き pointer のみ進む。
  if (isInTotalReview(a, m, units)) {
    return {
      progressIndex: total,
      unitsPerSession: newPer,
      unitsPerSessionPending: null,
      pointer: a.pointer + 1,
      status: "active",
      inTotalReview: true,
      finished: false,
    };
  }

  const newProgress = a.progressIndex + oldPer;

  if (total > 0 && newProgress >= total) {
    if (m.completionAction === "review_loop" && reviewEnabled(a)) {
      // 総復習ループ開始
      return {
        progressIndex: total,
        unitsPerSession: newPer,
        unitsPerSessionPending: null,
        pointer: a.pointer + 1,
        status: "active",
        inTotalReview: true,
        finished: true,
      };
    }
    // 完了
    return {
      progressIndex: total,
      unitsPerSession: newPer,
      unitsPerSessionPending: null,
      pointer: a.pointer + 1,
      status: "completed",
      inTotalReview: false,
      finished: true,
    };
  }

  return {
    progressIndex: newProgress,
    unitsPerSession: newPer,
    unitsPerSessionPending: null,
    pointer: a.pointer + 1,
    status: "active",
    inTotalReview: false,
    finished: false,
  };
}
