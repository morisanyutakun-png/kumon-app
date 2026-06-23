import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listGradingHistory, type HistoryRow } from "@/lib/queries";
import { computeGradeStats } from "@/lib/grades";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default async function OperatorGradesPage() {
  const p = await requireOperator();

  const [studentRows, allRows] = await Promise.all([
    db.select().from(students).where(eq(students.organizationId, p.organizationId)).orderBy(asc(students.name)),
    listGradingHistory(p.organizationId),
  ]);

  // 生徒ごとに採点履歴をまとめる
  const byStudent = new Map<string, HistoryRow[]>();
  for (const r of allRows) {
    const list = byStudent.get(r.studentId);
    if (list) list.push(r);
    else byStudent.set(r.studentId, [r]);
  }

  const rows = studentRows.map((st) => ({
    student: st,
    stats: computeGradeStats(byStudent.get(st.id) ?? []),
  }));

  const org = computeGradeStats(allRows); // 全体(教科分布・全体合格率に使用)
  const activeStudents = rows.filter((r) => r.stats.gradedSubmissions > 0).length;

  const overall = [
    { label: "生徒数", value: `${studentRows.length}` },
    { label: "採点済み課題", value: `${org.gradedSubmissions}` },
    { label: "全体合格率", value: `${org.passRate}%` },
    { label: "平均点", value: org.avgPct == null ? "—" : `${org.avgPct}%` },
  ];

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>成績管理</h1>
        <p>生徒ごとの合格率・平均点・教科別の成績を集計しています。生徒名から個別の成績へ。</p>
      </div>

      <div className="grade-tiles" style={{ marginBottom: 14 }}>
        {overall.map((t) => (
          <div key={t.label} className="grade-tile tone-info">
            <span className="grade-tile-label">{t.label}</span>
            <span className="grade-tile-value">{t.value}</span>
          </div>
        ))}
      </div>

      {org.subjects.length > 0 && (
        <div className="card">
          <h2>教科別の合格率（全体）</h2>
          <div className="subj-list">
            {org.subjects.map((sub) => (
              <div key={sub.subject} className="subj-row">
                <div className="subj-head">
                  <span className="subj-name">{sub.subject}</span>
                  <span className="subj-meta">合格 {sub.pass}/{sub.graded}{sub.avgPct != null && <> ・ 平均 {sub.avgPct}%</>}</span>
                </div>
                <div className="subj-bar"><span className="subj-bar-fill" style={{ width: `${sub.passRate}%` }} /></div>
                <span className="subj-rate">{sub.passRate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
        <table className="record-table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ width: "22%" }}>生徒</th>
              <th style={{ width: 76 }}>学年</th>
              <th style={{ width: 90 }}>採点済</th>
              <th>合格率</th>
              <th style={{ width: 90 }}>平均点</th>
              <th style={{ width: 90 }}>最終</th>
              <th className="right" style={{ width: 90 }}>成績</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student: st, stats }) => (
              <tr key={st.id}>
                <td><Link href={`/grades/${st.id}`} style={{ fontWeight: 600 }}>{st.name}</Link></td>
                <td>{st.grade || "—"}</td>
                <td className="muted">{stats.gradedSubmissions}</td>
                <td>
                  {stats.gradedSubmissions > 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "100%" }}>
                      <span className="subj-bar" style={{ flex: 1, maxWidth: 160 }}>
                        <span className="subj-bar-fill" style={{ width: `${stats.passRate}%` }} />
                      </span>
                      <b>{stats.passRate}%</b>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{stats.avgPct == null ? <span className="muted">—</span> : `${stats.avgPct}%`}</td>
                <td className="muted">{fmtDate(stats.lastActivity)}</td>
                <td className="right">
                  <Link href={`/grades/${st.id}`} className="db-badge">開く</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="empty">生徒がいません。「生徒・保護者」から登録してください。</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        採点中の生徒 {activeStudents} 名 / 全 {studentRows.length} 名。合格率は提出ごとの最新採点で算出（再提出の重複は除外）。
      </p>
    </div>
  );
}
