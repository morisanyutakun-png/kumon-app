/**
 * yuta-eng の科目ID → 教材の教科ラベル(materials.subject)への対応表。
 *
 * 「購入科目 → 生徒への教材割り当て」で、どの教科の教材を割り当てるかを決める。
 * materials.subject は自由文字列なので、中高部教材を登録する際はここのラベルに
 * 合わせて subject を付けること(合わせれば自動でマッチする)。運用に応じて編集可。
 *
 * yuta-eng 側の科目ID(仕様):
 *   physics-basic, physics, chemistry-basic, chemistry,
 *   math-1a, math-2bc, math-3c, english-reading, english-grammar
 */
export const YUTA_SUBJECT_LABEL: Record<string, string> = {
  "physics-basic": "物理基礎",
  physics: "物理",
  "chemistry-basic": "化学基礎",
  chemistry: "化学",
  "math-1a": "数学IA",
  "math-2bc": "数学IIBC",
  "math-3c": "数学IIIC",
  "english-reading": "英語(読解)",
  "english-grammar": "英語(文法)",
};

/** 購入科目ID配列 → 割り当て対象の教科ラベル(重複排除)。未知IDはそのまま通す。 */
export function materialSubjectsForPurchase(subjectIds: string[]): string[] {
  const labels = subjectIds.map((id) => YUTA_SUBJECT_LABEL[id] ?? id).filter(Boolean);
  return [...new Set(labels)];
}
