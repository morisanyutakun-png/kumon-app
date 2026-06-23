import type { HistoryRow } from "@/lib/queries";
import { computeGradeStats } from "@/lib/grades";
import { HistoryList } from "@/components/history-list";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
}

/** 得点率の推移をシンプルな折れ線(SVG)で表示。 */
function Sparkline({ points }: { points: { pct: number | null }[] }) {
  const vals = points.map((p) => p.pct).filter((n): n is number => n != null);
  if (vals.length < 2) return null;
  const W = 520, H = 90, pad = 8;
  const step = (W - pad * 2) / (vals.length - 1);
  const xy = vals.map((v, i) => [pad + i * step, H - pad - (v / 100) * (H - pad * 2)] as const);
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grade-spark" preserveAspectRatio="none" role="img" aria-label="得点率の推移">
      <line x1={pad} y1={H - pad - (0.6 * (H - pad * 2))} x2={W - pad} y2={H - pad - (0.6 * (H - pad * 2))} className="grade-spark-guide" />
      <path d={area} className="grade-spark-area" />
      <path d={d} className="grade-spark-line" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6} className="grade-spark-dot" />
      ))}
    </svg>
  );
}

/**
 * 1人の生徒の成績レポート。rows はその生徒のみの採点履歴(新しい順)。
 * 管理者画面・本人/保護者画面の両方で共通利用する。
 */
export function GradeReport({
  rows,
  showStudentName = false,
}: {
  rows: HistoryRow[];
  showStudentName?: boolean;
}) {
  const s = computeGradeStats(rows);

  const tiles: { label: string; value: string; sub?: string; tone: string }[] = [
    { label: "合格率", value: `${s.passRate}%`, sub: `${s.passCount}/${s.gradedSubmissions} 課題`, tone: "ok" },
    { label: "平均点", value: s.avgPct == null ? "—" : `${s.avgPct}%`, sub: "得点率の平均", tone: "info" },
    { label: "はなまる", value: `${s.passCount}`, sub: s.level.name, tone: "star" },
    { label: "連続学習", value: `${s.streak}`, sub: "日", tone: "fire" },
  ];

  return (
    <div className="grade-report">
      <div className="grade-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={`grade-tile tone-${t.tone}`}>
            <span className="grade-tile-label">{t.label}</span>
            <span className="grade-tile-value">{t.value}</span>
            {t.sub && <span className="grade-tile-sub">{t.sub}</span>}
          </div>
        ))}
      </div>

      {s.gradedSubmissions === 0 ? (
        <div className="card">
          <p className="empty">まだ採点された課題がありません。提出して採点されると、ここに成績が集計されます。</p>
        </div>
      ) : (
        <>
          <div className="grade-cols">
            <div className="card">
              <h2>教科別の成績</h2>
              <div className="subj-list">
                {s.subjects.map((sub) => (
                  <div key={sub.subject} className="subj-row">
                    <div className="subj-head">
                      <span className="subj-name">{sub.subject}</span>
                      <span className="subj-meta">
                        合格 {sub.pass}/{sub.graded}
                        {sub.avgPct != null && <> ・ 平均 {sub.avgPct}%</>}
                      </span>
                    </div>
                    <div className="subj-bar">
                      <span className="subj-bar-fill" style={{ width: `${sub.passRate}%` }} />
                    </div>
                    <span className="subj-rate">{sub.passRate}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>得点率の推移</h2>
              {s.trend.filter((t) => t.pct != null).length >= 2 ? (
                <>
                  <Sparkline points={s.trend} />
                  <p className="hint" style={{ marginTop: 8 }}>
                    直近 {s.gradedSubmissions} 課題 ・ 最終活動 {fmtDate(s.lastActivity)}
                  </p>
                </>
              ) : (
                <p className="empty">点数つきの採点が2件以上たまるとグラフが表示されます。</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2>採点・返却の履歴</h2>
            <HistoryList rows={s.recent} showStudent={showStudentName} />
          </div>
        </>
      )}
    </div>
  );
}
