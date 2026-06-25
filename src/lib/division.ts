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
