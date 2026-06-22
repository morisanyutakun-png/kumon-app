/**
 * 学年に応じた、教育的で前向きな応援メッセージ。
 * 学年バンドごとに数パターンを持ち、日付で日替わりに選ぶ(サーバーで決定)。
 */
function band(grade: string): "g12" | "g34" | "g56" | "jhs" | "default" {
  if (grade === "小1" || grade === "小2") return "g12";
  if (grade === "小3" || grade === "小4") return "g34";
  if (grade === "小5" || grade === "小6") return "g56";
  if (grade.startsWith("中")) return "jhs";
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

/** 学年に合った今日のメッセージ。 */
export function encourageMessage(grade: string): string {
  const list = MESSAGES[band(grade)] ?? MESSAGES.default;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return list[dayOfYear % list.length];
}
