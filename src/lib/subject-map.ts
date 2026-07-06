/**
 * yuta-eng の科目ID → 教材マッチ条件。
 *
 * 既存の中高部教材は、管理画面の教科欄が「数学」「英語」のような大分類になっている。
 * そのため購入IDを materials.subject にそのまま突き合わせるだけでは
 * math-1a → 「数学IA標準」などが拾えない。ここでは購入IDごとに
 * 教科候補 + 教材名に含まれる語を持たせ、既存教材の命名に合わせて割り当てる。
 */
export interface PurchaseMaterialTarget {
  subjectId: string;
  label: string;
  subjects: string[];
  nameIncludes: string[];
}

export const YUTA_SUBJECT_TARGET: Record<string, Omit<PurchaseMaterialTarget, "subjectId">> = {
  "physics-basic": {
    label: "物理 基礎",
    subjects: ["物理 基礎", "物理基礎", "物理"],
    nameIncludes: ["物理 基礎", "物理基礎", "基礎", "入門"],
  },
  physics: {
    label: "物理 標準",
    subjects: ["物理 標準", "物理"],
    nameIncludes: ["物理 標準", "標準"],
  },
  "physics-advanced": {
    label: "物理 発展",
    subjects: ["物理 発展", "物理"],
    nameIncludes: ["物理 発展", "発展"],
  },
  "chemistry-basic": {
    label: "化学基礎",
    subjects: ["化学基礎", "化学"],
    nameIncludes: ["化学基礎"],
  },
  chemistry: {
    label: "化学",
    subjects: ["化学"],
    nameIncludes: ["化学"],
  },
  "math-1a": {
    label: "数学IA",
    subjects: ["数学IA", "数学"],
    nameIncludes: ["数学IA", "数学I A", "数学ⅠA", "数学Ⅰ A"],
  },
  "math-2bc": {
    label: "数学IIBC",
    subjects: ["数学IIBC", "数学"],
    nameIncludes: ["数学IIBC", "数学II BC", "数学ⅡBC", "数学Ⅱ BC"],
  },
  "math-3c": {
    label: "数学IIIC",
    subjects: ["数学IIIC", "数学"],
    nameIncludes: ["数学IIIC", "数学III C", "数学ⅢC", "数学Ⅲ C"],
  },
  "english-reading": {
    label: "英語長文",
    subjects: ["英語長文", "英語(読解)", "英語"],
    nameIncludes: ["英語長文", "長文"],
  },
  "english-grammar": {
    label: "英文法",
    subjects: ["英文法", "英語(文法)", "英語"],
    nameIncludes: ["英文法", "文法"],
  },
};

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 購入科目ID配列 → 教材マッチ条件(重複排除)。未知IDは subject 完全一致で扱う。 */
export function materialTargetsForPurchase(subjectIds: string[]): PurchaseMaterialTarget[] {
  const seen = new Set<string>();
  const targets: PurchaseMaterialTarget[] = [];
  for (const rawId of subjectIds) {
    const subjectId = rawId.trim();
    if (!subjectId || seen.has(subjectId)) continue;
    seen.add(subjectId);
    const target = YUTA_SUBJECT_TARGET[subjectId];
    if (target) {
      targets.push({ subjectId, ...target });
    } else {
      targets.push({
        subjectId,
        label: subjectId,
        subjects: [subjectId],
        nameIncludes: [],
      });
    }
  }
  return targets;
}

/** 購入科目ID配列 → 表示用ラベル(重複排除)。 */
export function materialSubjectsForPurchase(subjectIds: string[]): string[] {
  return materialTargetsForPurchase(subjectIds).map((target) => target.label);
}

export function matchesPurchaseTarget(
  material: { subject: string; name: string },
  target: PurchaseMaterialTarget,
): boolean {
  const subject = normalize(material.subject);
  const name = normalize(material.name);
  const subjectMatches = target.subjects.some((s) => normalize(s) === subject);
  if (!subjectMatches) return false;
  if (target.nameIncludes.length === 0) return true;
  return target.nameIncludes.some((token) => name.includes(normalize(token)));
}
