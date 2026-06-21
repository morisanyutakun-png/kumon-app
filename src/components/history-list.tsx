import type { HistoryRow } from "@/lib/queries";

function fmt(d: Date): string {
  return new Date(d).toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 採点(返却)履歴のリスト。showStudent で生徒名を表示 (保護者の複数生徒向け)。 */
export function HistoryList({
  rows,
  showStudent = false,
}: {
  rows: HistoryRow[];
  showStudent?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        まだ採点された履歴はありません。
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.gradingId} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {r.result && (
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-medium " +
                    (r.result === "ok"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700")
                  }
                >
                  {r.result === "ok" ? "合格" : "不合格"}
                </span>
              )}
              <span className="font-medium">
                {r.materialName}
                {r.rangeText ? `（${r.rangeText}）` : ""}
              </span>
              {showStudent && (
                <span className="text-xs text-slate-400">{r.studentName}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {(r.score !== null || r.maxScore !== null) && (
                <span className="font-bold">
                  {r.score ?? "—"}
                  {r.maxScore !== null && (
                    <span className="text-xs font-normal text-slate-400">
                      {" "}
                      / {r.maxScore}
                    </span>
                  )}
                </span>
              )}
              <span className="text-xs text-slate-400">{fmt(r.createdAt)}</span>
            </div>
          </div>
          {r.comment && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {r.comment}
            </p>
          )}
          {r.requiresResubmit && (
            <p className="mt-1 text-xs font-medium text-rose-600">再提出依頼</p>
          )}
        </li>
      ))}
    </ul>
  );
}
