/**
 * 成績の集計ロジック。採点履歴(HistoryRow[]) から、生徒1人ぶん(または組織全体)の
 * サマリー指標を算出する。提出ごとに「最新の採点」を採用し、再提出の重複加算を防ぐ。
 *
 * 重要: この関数はアクセス制御を行わない。呼び出し側で必ず accessibleStudentIds /
 * canAccessStudent を通し、許可された studentId の HistoryRow のみ渡すこと。
 */
import { levelInfo, studyStreak, type LevelInfo } from "@/lib/encourage";
import type { HistoryRow } from "@/lib/queries";

export interface SubjectStat {
  subject: string;
  graded: number;
  pass: number;
  passRate: number; // 0-100
  avgPct: number | null;
}
export interface TrendPoint {
  date: Date;
  pct: number | null;
  result: "ok" | "ng" | "skip" | null;
  label: string;
}
export interface GradeStats {
  gradedSubmissions: number; // 採点された課題数(提出単位・最新のみ)
  gradingCount: number; // 採点回数(再採点含む)
  passCount: number; // 合格(はなまる)数=最新で ok の課題
  passRate: number; // 0-100
  avgPct: number | null; // 平均得点率
  streak: number; // 連続学習日数
  level: LevelInfo;
  subjects: SubjectStat[];
  trend: TrendPoint[]; // 時系列(古い→新しい)
  recent: HistoryRow[]; // 新しい順(全件)
  lastActivity: Date | null;
}

function pct(score: string | null, max: string | null): number | null {
  const s = score == null ? null : parseFloat(score);
  const m = max == null ? null : parseFloat(max);
  if (s == null || m == null || !isFinite(s) || !isFinite(m) || m <= 0) return null;
  return Math.round((s / m) * 100);
}
function avg(nums: number[]): number | null {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

export function computeGradeStats(rows: HistoryRow[]): GradeStats {
  // rows は新しい順。提出ごとに最初に出てくる = 最新の採点。
  const latestBySub = new Map<string, HistoryRow>();
  for (const r of rows) if (!latestBySub.has(r.submissionId)) latestBySub.set(r.submissionId, r);
  const latest = [...latestBySub.values()];

  // 未実施(skip)は「採点された課題」「合格率の母数」から除外する。
  const judged = latest.filter((r) => r.result !== "skip");
  const gradedSubmissions = judged.length;
  const gradingCount = rows.length;
  const passCount = judged.filter((r) => r.result === "ok").length;
  const passRate = gradedSubmissions ? Math.round((passCount / gradedSubmissions) * 100) : 0;
  const avgPct = avg(latest.map((r) => pct(r.score, r.maxScore)).filter((n): n is number => n != null));
  const streak = studyStreak(rows.map((r) => r.createdAt));
  const level = levelInfo(passCount);

  const bySub = new Map<string, HistoryRow[]>();
  for (const r of judged) {
    const k = r.subject || "その他";
    const list = bySub.get(k);
    if (list) list.push(r);
    else bySub.set(k, [r]);
  }
  const subjects: SubjectStat[] = [...bySub.entries()]
    .map(([subject, list]) => {
      const pass = list.filter((r) => r.result === "ok").length;
      return {
        subject,
        graded: list.length,
        pass,
        passRate: list.length ? Math.round((pass / list.length) * 100) : 0,
        avgPct: avg(list.map((r) => pct(r.score, r.maxScore)).filter((n): n is number => n != null)),
      };
    })
    .sort((a, b) => b.graded - a.graded);

  const trend: TrendPoint[] = [...latest]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({ date: r.createdAt, pct: pct(r.score, r.maxScore), result: r.result, label: r.materialName }));

  return {
    gradedSubmissions,
    gradingCount,
    passCount,
    passRate,
    avgPct,
    streak,
    level,
    subjects,
    trend,
    recent: rows,
    lastActivity: rows.length ? rows[0].createdAt : null,
  };
}
