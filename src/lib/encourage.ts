/**
 * 学年に応じた、教育的で前向きな応援メッセージ。
 * 学年バンドごとに数パターンを持ち、日付で日替わりに選ぶ(サーバーで決定)。
 */
function band(grade: string): "g12" | "g34" | "g56" | "jhs" | "default" {
  if (grade === "小1" || grade === "小2") return "g12";
  if (grade === "小3" || grade === "小4") return "g34";
  if (grade === "小5" || grade === "小6") return "g56";
  // 中高部 (中学・高校) は落ち着いたトーン。
  if (grade.startsWith("中") || grade.startsWith("高")) return "jhs";
  return "default";
}

const MESSAGES: Record<string, string[]> = {
  g12: [
    "きょうもいっしょに がんばろう！1もん できたら はなまる。",
    "すこしずつで だいじょうぶ。まずは やってみよう！",
    "まちがえても へいき。それが おべんきょうだよ。",
  ],
  g34: [
    "コツコツ つづけると、ぐんぐん 力がつくよ！",
    "今日の1問が、明日の自信になる。やってみよう！",
    "わからないところは チャンス。ちょうせんしてみよう！",
  ],
  g56: [
    "毎日の積み重ねが、本当の力になる。集中していこう！",
    "できたところを数えよう。ちゃんと前に進んでいるよ。",
    "むずかしい問題ほど、のびしろ。じっくり取り組もう。",
  ],
  jhs: [
    "目標から逆算して、今日の一歩を踏み出そう。",
    "継続は力なり。まずは今日の学習を始めよう。",
    "復習で定着、演習で得点。着実に積み上げよう。",
  ],
  default: ["きょうも一歩ずつ。学びを楽しもう！"],
};

// ===== 称号(レベル) =====
const LEVELS = [
  { min: 0, name: "はじめのいっぽ" },
  { min: 3, name: "がんばりや" },
  { min: 10, name: "のびざかり" },
  { min: 25, name: "たつじん" },
  { min: 50, name: "スタディマスター" },
];

export interface LevelInfo {
  level: number; // 1始まり
  name: string;
  progress: number; // 現レベル内の進捗 0-100
  remaining: number; // 次の称号まであと何はなまる
  isMax: boolean;
}

/** はなまる(合格)数から称号と次までの進捗を返す。 */
export function levelInfo(pass: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (pass >= LEVELS[i].min) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1];
  if (!next) {
    return { level: idx + 1, name: cur.name, progress: 100, remaining: 0, isMax: true };
  }
  const span = next.min - cur.min;
  const progress = Math.min(100, Math.round(((pass - cur.min) / span) * 100));
  return { level: idx + 1, name: cur.name, progress, remaining: next.min - pass, isMax: false };
}

/** 直近の活動日(JST)から連続学習日数を計算。今日未活動でも前日までの連続を維持。 */
export function studyStreak(dates: Date[]): number {
  const key = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  const set = new Set(dates.filter(Boolean).map((d) => key(new Date(d))));
  if (set.size === 0) return 0;
  const today = new Date();
  let cursor = new Date(today);
  // 今日未提出なら昨日起点で猶予(連続が途切れない)
  if (!set.has(key(cursor))) cursor = new Date(cursor.getTime() - 86400000);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    if (set.has(key(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 86400000);
    } else break;
  }
  return streak;
}

/** 学年に合った今日のメッセージ。 */
export function encourageMessage(grade: string): string {
  const list = MESSAGES[band(grade)] ?? MESSAGES.default;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return list[dayOfYear % list.length];
}
