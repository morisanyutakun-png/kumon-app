import type { Grading, MistakeTag } from "@/db/schema";

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GradingHistory({
  gradings,
}: {
  gradings: (Grading & { mistakes: MistakeTag[] })[];
}) {
  if (gradings.length === 0) {
    return <p className="text-sm text-slate-500">まだ採点結果はありません。</p>;
  }
  return (
    <div className="space-y-3">
      {gradings.map((g) => (
        <div key={g.id} className="rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {g.result && (
                <span
                  className={
                    "rounded-none px-2 py-0.5 text-xs font-medium " +
                    (g.result === "ok"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700")
                  }
                >
                  {g.result === "ok" ? "合格" : "不合格"}
                </span>
              )}
              {(g.score !== null || g.maxScore !== null) && (
                <span className="text-lg font-bold">
                  {g.score ?? "—"}
                  {g.maxScore !== null && (
                    <span className="text-sm font-normal text-slate-400">
                      {" "}
                      / {g.maxScore}
                    </span>
                  )}
                </span>
              )}
              <span className="text-xs text-slate-400">{g.attemptNo}回目</span>
            </div>
            <span className="text-xs text-slate-400">{fmt(g.createdAt)}</span>
          </div>
          {g.mistakes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.mistakes.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-xs"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-none"
                    style={{ backgroundColor: m.color }}
                  />
                  {m.name}
                </span>
              ))}
            </div>
          )}
          {g.comment && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {g.comment}
            </p>
          )}
          {g.requiresResubmit && (
            <p className="mt-1 text-xs font-medium text-rose-600">
              ※ 再提出が依頼されました
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
