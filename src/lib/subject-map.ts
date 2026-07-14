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
  /** これらの語を教材名に含む教材は除外する(お試し⇄フルの相互誤マッチ防止)。 */
  nameExcludes?: string[];
}

/** お試し購入ID(`<fullId>-trial`)の接尾辞。 */
const TRIAL_SUFFIX = "-trial";

/** 例: "math-1a-trial" → true。 */
export function isTrialSubjectId(subjectId: string): boolean {
  return subjectId.trim().endsWith(TRIAL_SUFFIX);
}

/** お試しID → 対応するフル科目ID。フルIDならそのまま返す。例: "math-1a-trial" → "math-1a"。 */
export function fullSubjectIdOf(subjectId: string): string {
  const id = subjectId.trim();
  return isTrialSubjectId(id) ? id.slice(0, -TRIAL_SUFFIX.length) : id;
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
    nameIncludes: ["化学 総集編", "化学総集編"],
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

/** お試し教材(名前に含む語)。フルとお試しの相互誤マッチを防ぐ既定の除外語でもある。 */
const TRIAL_NAME_TOKEN = "お試し";

/**
 * 購入科目ID配列 → 教材マッチ条件(重複排除)。
 * - フルID(例 math-1a): 通常のターゲット。既定で「お試し」教材を除外する。
 * - お試しID(例 math-1a-trial): 対応フルの科目候補 + 「お試し」名を要求(=お試し教材だけを拾う)。
 * - 未知ID: subject 完全一致で扱う。
 */
export function materialTargetsForPurchase(subjectIds: string[]): PurchaseMaterialTarget[] {
  const seen = new Set<string>();
  const targets: PurchaseMaterialTarget[] = [];
  for (const rawId of subjectIds) {
    const subjectId = rawId.trim();
    if (!subjectId || seen.has(subjectId)) continue;
    seen.add(subjectId);

    if (isTrialSubjectId(subjectId)) {
      const fullId = fullSubjectIdOf(subjectId);
      const base = YUTA_SUBJECT_TARGET[fullId];
      targets.push({
        subjectId,
        label: `${base?.label ?? fullId} お試し`,
        subjects: base?.subjects ?? [fullId],
        nameIncludes: [TRIAL_NAME_TOKEN], // お試し教材(名前に「お試し」)だけを拾う
        nameExcludes: [],
      });
      continue;
    }

    const target = YUTA_SUBJECT_TARGET[subjectId];
    if (target) {
      // フル購入はお試し教材を拾わない(名前に「お試し」を含む教材を除外)。
      targets.push({ subjectId, ...target, nameExcludes: target.nameExcludes ?? [TRIAL_NAME_TOKEN] });
    } else {
      targets.push({
        subjectId,
        label: subjectId,
        subjects: [subjectId],
        nameIncludes: [],
        nameExcludes: [TRIAL_NAME_TOKEN],
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
  // 除外語(例: お試し)を含む教材はマッチさせない。
  if (target.nameExcludes?.some((token) => name.includes(normalize(token)))) return false;
  if (target.nameIncludes.length === 0) return true;
  return target.nameIncludes.some((token) => name.includes(normalize(token)));
}
