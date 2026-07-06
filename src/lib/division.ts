/**
 * 学年(grade)から「部門(division)」を判定する純関数。
 *   小学部 (elementary): 小1〜小6 など
 *   中高部 (secondary):  中1〜中3 / 高1〜高3 など
 *
 * 学年テキストは自由形式 (例: "小3", "中1", "高2")。"中"/"高" で始まれば中高部。
 */
export type Division = "elementary" | "secondary";

export function divisionForGrade(grade: string | null | undefined): Division {
  const g = (grade ?? "").trim();
  if (g.startsWith("中") || g.startsWith("高")) return "secondary";
  // 英語表記のゆれにも一応対応 (J/H, JHS など)
  if (/^(中|高|jhs|jr|sr|j[0-9]|h[0-9])/i.test(g)) return "secondary";
  return "elementary";
}

export function isSecondary(grade: string | null | undefined): boolean {
  return divisionForGrade(grade) === "secondary";
}

export const DIVISION_LABEL: Record<Division, string> = {
  elementary: "小学部",
  secondary: "中高部",
};

/** 管理画面の学年プルダウンの定型選択肢(小学部〜中高部)。自動発行の高校学年(高1〜高卒)も含む。 */
export const GRADES = [
  "小1", "小2", "小3", "小4", "小5", "小6",
  "中1", "中2", "中3",
  "高1", "高2", "高3", "高卒",
] as const;

/**
 * 学年selectの選択肢。現在値が定型リストに無い場合でも必ず先頭に含めることで、
 * 一覧外の値(例: "その他"・表記ゆれ)が黙って先頭(小1)に化けるのを防ぐ。
 */
export function gradeOptions(current?: string | null): string[] {
  const c = (current ?? "").trim();
  return c && !(GRADES as readonly string[]).includes(c) ? [c, ...GRADES] : [...GRADES];
}
