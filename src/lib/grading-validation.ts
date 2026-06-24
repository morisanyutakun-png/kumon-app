/**
 * 採点の得点・満点ペアの検証 (PHP 添削結果入力表の入力仕様を移植)。
 *
 * "use server" のアクションファイルから分離した純関数モジュール。
 * (server ファイルでは export が async 関数に限られるため、ここに置く)
 */

/** 得点・満点の組み合わせが不正なときに投げるエラー。 */
export class ScoreValidationError extends Error {}

/**
 * 得点・満点ペアの検証:
 * - 得点を入れたら満点も必須
 * - 得点 > 満点 は不可
 * - 満点 ≤ 0 は不可
 * 値が空なら検証を素通りする (合否だけの記録も許可)。
 * @returns 正答率 (score/maxScore を 0〜1 に丸めたもの) | null
 */
export function validateScorePair(
  scoreRaw: string,
  maxScoreRaw: string,
  who = "",
): number | null {
  const label = who ? `${who}: ` : "";
  const score = scoreRaw.trim();
  const max = maxScoreRaw.trim();
  if (score === "" && max === "") return null;
  if (score !== "" && max === "") {
    throw new ScoreValidationError(`${label}得点を入力した場合は満点も入力してください。`);
  }
  const maxNum = max === "" ? null : Number(max);
  if (maxNum !== null && (!Number.isFinite(maxNum) || maxNum <= 0)) {
    throw new ScoreValidationError(`${label}満点は 0 より大きい値にしてください。`);
  }
  const scoreNum = score === "" ? null : Number(score);
  if (scoreNum !== null && (!Number.isFinite(scoreNum) || scoreNum < 0)) {
    throw new ScoreValidationError(`${label}得点は 0 以上の数値にしてください。`);
  }
  if (scoreNum !== null && maxNum !== null && scoreNum > maxNum) {
    throw new ScoreValidationError(`${label}得点が満点を超えています。`);
  }
  if (scoreNum !== null && maxNum !== null && maxNum > 0) {
    return Math.round((scoreNum / maxNum) * 10000) / 10000;
  }
  return null;
}
