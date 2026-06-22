import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listGradingHistory } from "@/lib/queries";
import { HistoryList } from "@/components/history-list";

export default async function StudentHistoryPage() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const rows = ids === "*" ? [] : await listGradingHistory(p.organizationId, { studentIds: ids });
  const showStudent = p.role === "parent" && ids !== "*" && ids.length > 1;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>学習・成績の履歴</h1>
        <p>これまでに返却された採点結果の一覧です。</p>
      </div>
      <div className="card">
        <HistoryList rows={rows} showStudent={showStudent} />
      </div>
    </div>
  );
}
