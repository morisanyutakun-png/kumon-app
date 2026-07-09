export interface MaterialCover {
  asin: string;
  title: string;
  imageUrl: string;
  amazonUrl: string;
  accent: string;
}

interface CoverEntry extends MaterialCover {
  subjects: string[];
  tokens: string[];
}

const imageUrl = (asin: string) => `https://images-na.ssl-images-amazon.com/images/P/${asin}.09._SY240_.jpg`;
const amazonUrl = (asin: string) => `https://www.amazon.co.jp/dp/${asin}`;

const COVER_ENTRIES: CoverEntry[] = [
  {
    asin: "B0H7YWLDJJ",
    title: "ノビットの化学基礎 標準",
    imageUrl: imageUrl("B0H7YWLDJJ"),
    amazonUrl: amazonUrl("B0H7YWLDJJ"),
    accent: "#0d9488",
    subjects: ["化学", "化学基礎"],
    tokens: ["化学基礎", "化学 基礎"],
  },
  {
    asin: "B0H7RHT1NF",
    title: "ノビットの化学 標準",
    imageUrl: imageUrl("B0H7RHT1NF"),
    amazonUrl: amazonUrl("B0H7RHT1NF"),
    accent: "#0f766e",
    subjects: ["化学"],
    tokens: ["化学総集編", "化学 総集編", "化学標準", "化学 標準"],
  },
  {
    asin: "B0H7LPFKN1",
    title: "ノビットの英語・長文 Standard",
    imageUrl: imageUrl("B0H7LPFKN1"),
    amazonUrl: amazonUrl("B0H7LPFKN1"),
    accent: "#2563eb",
    subjects: ["英語", "英語長文"],
    tokens: ["英語長文", "英語 長文", "英語・長文", "長文"],
  },
  {
    asin: "B0H7LQW2W8",
    title: "ノビットの英語・文法 Standard",
    imageUrl: imageUrl("B0H7LQW2W8"),
    amazonUrl: amazonUrl("B0H7LQW2W8"),
    accent: "#7c3aed",
    subjects: ["英語", "英文法"],
    tokens: ["英文法", "英語文法", "英語 文法", "英語・文法", "文法"],
  },
  {
    asin: "B0H724CBBT",
    title: "ノビットの数学III C 標準演習",
    imageUrl: imageUrl("B0H724CBBT"),
    amazonUrl: amazonUrl("B0H724CBBT"),
    accent: "#0369a1",
    subjects: ["数学", "数学IIIC"],
    tokens: ["数学IIIC", "数学III C", "数学3C", "数学ⅢC", "数学Ⅲ C"],
  },
  {
    asin: "B0H71TQJYY",
    title: "ノビットの数学II BC 標準演習",
    imageUrl: imageUrl("B0H71TQJYY"),
    amazonUrl: amazonUrl("B0H71TQJYY"),
    accent: "#0284c7",
    subjects: ["数学", "数学IIBC"],
    tokens: ["数学IIBC", "数学II BC", "数学2BC", "数学ⅡBC", "数学Ⅱ BC"],
  },
  {
    asin: "B0H6ZRPLVJ",
    title: "ノビットの数学I A 標準演習",
    imageUrl: imageUrl("B0H6ZRPLVJ"),
    amazonUrl: amazonUrl("B0H6ZRPLVJ"),
    accent: "#0ea5e9",
    subjects: ["数学", "数学IA"],
    tokens: ["数学IA", "数学I A", "数学1A", "数学ⅠA", "数学Ⅰ A"],
  },
  {
    asin: "B0H66JNR6Q",
    title: "高校物理問題集 無双",
    imageUrl: imageUrl("B0H66JNR6Q"),
    amazonUrl: amazonUrl("B0H66JNR6Q"),
    accent: "#0891b2",
    subjects: ["物理"],
    tokens: ["物理無双", "物理 問題集 無双", "無双"],
  },
  {
    asin: "B0H4J34162",
    title: "考える力を育てる高校物理 基礎演習",
    imageUrl: imageUrl("B0H4J34162"),
    amazonUrl: amazonUrl("B0H4J34162"),
    accent: "#0d9488",
    subjects: ["物理", "物理基礎"],
    tokens: ["物理入門演習", "物理 入門演習", "物理基礎演習", "物理 基礎演習", "物理基礎"],
  },
  {
    asin: "B0H639CPQW",
    title: "考える力を育てる高校物理 発展演習",
    imageUrl: imageUrl("B0H639CPQW"),
    amazonUrl: amazonUrl("B0H639CPQW"),
    accent: "#ea580c",
    subjects: ["物理"],
    tokens: ["物理発展演習", "物理 発展演習", "発展演習"],
  },
  {
    asin: "B0H3LLW1F2",
    title: "考える力を育てる高校物理 標準演習",
    imageUrl: imageUrl("B0H3LLW1F2"),
    amazonUrl: amazonUrl("B0H3LLW1F2"),
    accent: "#2563eb",
    subjects: ["物理"],
    tokens: ["物理標準演習", "物理 標準演習", "標準演習"],
  },
];

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s・_ー\-]/g, "");
}

export function subjectAccentColor(subject: string): string {
  const normalized = subject.normalize("NFKC");
  if (normalized.startsWith("数学") || normalized === "算数") return "#1aa3e6";
  if (normalized.includes("英語") || normalized.includes("英文")) return "#7c5cfc";
  if (normalized.includes("物理")) return "#18c39a";
  if (normalized.includes("化学")) return "#00a3a3";
  if (normalized.includes("生物")) return "#3bb54a";
  switch (normalized) {
    case "算数":
    case "数学":
      return "#1aa3e6";
    case "国語":
      return "#ff5d8f";
    case "理科":
    case "物理":
      return "#18c39a";
    case "化学":
      return "#00a3a3";
    case "生物":
      return "#3bb54a";
    case "社会":
    case "地歴公民":
      return "#ff8a3d";
    case "英語":
      return "#7c5cfc";
    case "情報":
    case "プログラミング":
      return "#13b6c9";
    default:
      return "#1c9dd8";
  }
}

export function materialCoverFor({
  materialName,
  subject,
}: {
  materialName: string;
  subject: string;
}): MaterialCover | null {
  const name = normalize(materialName);
  const subj = normalize(subject);
  const hit = COVER_ENTRIES.find((entry) => {
    const subjectMatches = entry.subjects.some((s) => normalize(s) === subj);
    if (!subjectMatches) return false;
    return entry.tokens.some((token) => name.includes(normalize(token)));
  });
  if (!hit) return null;
  return {
    asin: hit.asin,
    title: hit.title,
    imageUrl: hit.imageUrl,
    amazonUrl: hit.amazonUrl,
    accent: hit.accent,
  };
}
