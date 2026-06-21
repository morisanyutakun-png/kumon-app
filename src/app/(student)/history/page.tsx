import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { listGradingHistory } from "@/lib/queries";
import { HistoryList } from "@/components/history-list";
import { Card, CardContent } from "@/components/ui/card";

export default async function StudentHistoryPage() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const rows =
    ids === "*" ? [] : await listGradingHistory(p.organizationId, { studentIds: ids });

  // 保護者で複数の生徒を持つ場合は生徒名を表示。
  const showStudent = p.role === "parent" && ids !== "*" && ids.length > 1;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">学習・成績の履歴</h1>
      <p className="text-sm text-slate-500">
        これまでに返却された採点結果の一覧です。
      </p>
      <Card>
        <CardContent className="pt-6">
          <HistoryList rows={rows} showStudent={showStudent} />
        </CardContent>
      </Card>
    </div>
  );
}
