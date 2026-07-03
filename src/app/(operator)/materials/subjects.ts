import type { Division } from "@/lib/division";

/** 小学部の教科プルダウン。 */
export const ELEMENTARY_SUBJECTS = [
  "算数",
  "国語",
  "理科",
  "社会",
  "英語",
  "プログラミング",
  "その他",
];
/** 中高部の教科プルダウン（高校教科名）。 */
export const SECONDARY_SUBJECTS = [
  "数学",
  "英語",
  "物理",
  "化学",
  "生物",
  "国語",
  "地歴公民",
  "情報",
  "その他",
];

export function subjectsFor(division: Division): string[] {
  return division === "secondary" ? SECONDARY_SUBJECTS : ELEMENTARY_SUBJECTS;
}
