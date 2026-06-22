import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { assignmentMatrix } from "@/lib/queries";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { AgAddCell, AgDeleteButton } from "./assign-cells";

/** 教科ごとのアクセント色 (PHP ag_subject_color 相当)。 */
function subjectColor(subject: string): { accent: string; soft: string; ink: string } {
  switch (subject) {
    case "英語": return { accent: "#2563eb", soft: "#eff6ff", ink: "#1e3a8a" };
    case "国語": return { accent: "#dc2626", soft: "#fef2f2", ink: "#7f1d1d" };
    case "数学": return { accent: "#059669", soft: "#ecfdf5", ink: "#065f46" };
    case "理科": return { accent: "#0891b2", soft: "#ecfeff", ink: "#155e75" };
    case "社会": return { accent: "#d97706", soft: "#fffbeb", ink: "#92400e" };
    case "情報": return { accent: "#7c3aed", soft: "#f5f3ff", ink: "#5b21b6" };
    default: return { accent: "#64748b", soft: "#f8fafc", ink: "#334155" };
  }
}

export default async function AssignmentsPage() {
  const p = await requireOperator();
  const { students, maxCols, materials } = await assignmentMatrix(p.organizationId);

  const cols = Math.max(maxCols, 0);
  const noData = students.length === 0 || materials.length === 0;

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>課題割り当て</h1>
          <p>生徒ごとに教材を割り当てます。「＋」列で追加、各セルの × で削除できます。</p>
          <div className="metric-row">
            <span className="metric-chip">生徒 {students.length} 名</span>
            <span className="metric-chip">教材 {materials.length} 件</span>
          </div>
        </div>
      </div>

      {noData && (
        <p className="hint" style={{ marginBottom: 12 }}>
          ※ 先に <Link href="/students" className="ag-open">生徒</Link> と{" "}
          <Link href="/materials" className="ag-open">教材</Link> を登録してください。
        </p>
      )}

      {students.length > 0 && (
        <div className="assign-wrap">
          <table className="assign-grid">
            <thead>
              <tr>
                <th className="ag-name">生徒</th>
                {Array.from({ length: cols }).map((_, i) => (
                  <th key={i}>課題{i + 1}</th>
                ))}
                <th>＋</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentId}>
                  <td className="ag-name">
                    <Link href={`/students/${s.studentId}`} className="ag-open">
                      {s.studentName}
                    </Link>
                    <span className="small">{s.grade || "未設定"}</span>
                  </td>

                  {Array.from({ length: cols }).map((_, i) => {
                    const cell = s.cells[i];
                    if (!cell) return <td key={i} className="empty-cell" />;
                    const c = subjectColor(cell.subject);
                    return (
                      <td
                        key={i}
                        className="ag-cell assigned"
                        style={{ ["--c" as string]: c.accent, ["--soft" as string]: c.soft, ["--ink" as string]: c.ink, background: c.soft }}
                      >
                        <div className="ag-mat">{cell.materialName}</div>
                        {cell.rangeText && <div className="ag-range">{cell.rangeText}</div>}
                        <div className="ag-actions">
                          {cell.status && (
                            <span className="ag-status">{SUBMISSION_STATUS_LABELS[cell.status]}</span>
                          )}
                          {cell.submissionId && (
                            <Link href={`/grading/${cell.submissionId}`} className="ag-open">
                              開く
                            </Link>
                          )}
                          <AgDeleteButton assignmentId={cell.assignmentId} label={cell.materialName} />
                        </div>
                      </td>
                    );
                  })}

                  <td className={`ag-addcell${materials.length === 0 ? " empty-add" : ""}`}>
                    {materials.length > 0 ? (
                      <AgAddCell studentId={s.studentId} materials={materials} />
                    ) : (
                      <span className="hint">教材なし</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
