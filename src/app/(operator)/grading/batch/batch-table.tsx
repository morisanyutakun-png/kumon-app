"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { batchGrade, type BatchGradeItem } from "@/lib/actions/submission-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface BatchRow {
  submissionId: string;
  studentName: string;
  studentGrade: string;
  materialName: string;
  subject: string;
  rangeText: string;
  sessionNo: number;
  attemptCount: number;
  images: { id: string; fileName: string }[];
}

interface RowState {
  score: string;
  maxScore: string;
  result: "" | "ok" | "ng";
  comment: string;
  op: "" | "return" | "resubmit";
}

const emptyRow: RowState = { score: "", maxScore: "", result: "", comment: "", op: "" };

const selectCls =
  "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm";

export function BatchGradeTable({ rows }: { rows: BatchRow[] }) {
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.submissionId, { ...emptyRow }])),
  );
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        採点待ち(提出済み)の答案はありません。
      </p>
    );
  }

  function update(id: string, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function save() {
    const items: BatchGradeItem[] = rows
      .filter((r) => state[r.submissionId]?.op)
      .map((r) => {
        const st = state[r.submissionId];
        return {
          submissionId: r.submissionId,
          score: st.score,
          maxScore: st.maxScore,
          result: st.result,
          comment: st.comment,
          mode: st.op === "resubmit" ? "resubmit" : "return",
        };
      });
    if (items.length === 0) {
      toast.warning("「操作」を選んだ行がありません。");
      return;
    }
    startTransition(async () => {
      try {
        const res = await batchGrade(items);
        toast.success(`${res.processed}件を処理しました。`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">採点待ち {rows.length} 件</span>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "保存中..." : "入力した行をまとめて保存"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
              <th className="p-2">生徒</th>
              <th className="p-2">課題 / 範囲</th>
              <th className="p-2">答案</th>
              <th className="p-2 text-center">得点</th>
              <th className="p-2 text-center">満点</th>
              <th className="p-2 text-center">合否</th>
              <th className="p-2">コメント</th>
              <th className="p-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = state[r.submissionId];
              return (
                <tr key={r.submissionId} className="border-b align-top">
                  <td className="p-2">
                    <div className="font-medium">{r.studentName}</div>
                    <div className="text-xs text-slate-400">{r.studentGrade}</div>
                  </td>
                  <td className="p-2">
                    <div>{r.materialName}</div>
                    <div className="text-xs text-slate-400">
                      {r.subject} / {r.rangeText || "—"} ・ {r.sessionNo}回目
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {r.images.slice(0, 3).map((img) => (
                        <a
                          key={img.id}
                          href={`/api/files/submission/${img.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title={img.fileName}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/files/submission/${img.id}`}
                            alt={img.fileName}
                            className="h-12 w-12 rounded border object-cover"
                          />
                        </a>
                      ))}
                      <Link
                        href={`/grading/${r.submissionId}`}
                        className="self-center text-xs text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                    </div>
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.5"
                      inputMode="decimal"
                      value={st.score}
                      onChange={(e) => update(r.submissionId, { score: e.target.value })}
                      className="h-9 w-20"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.5"
                      inputMode="decimal"
                      value={st.maxScore}
                      onChange={(e) => update(r.submissionId, { maxScore: e.target.value })}
                      className="h-9 w-20"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <select
                      value={st.result}
                      onChange={(e) =>
                        update(r.submissionId, { result: e.target.value as RowState["result"] })
                      }
                      className={selectCls}
                    >
                      <option value="">—</option>
                      <option value="ok">合格</option>
                      <option value="ng">不合格</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={st.comment}
                      onChange={(e) => update(r.submissionId, { comment: e.target.value })}
                      placeholder="コメント"
                      className="h-9 min-w-40"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <select
                      value={st.op}
                      onChange={(e) =>
                        update(r.submissionId, { op: e.target.value as RowState["op"] })
                      }
                      className={selectCls}
                    >
                      <option value="">—</option>
                      <option value="return">返却</option>
                      <option value="resubmit">再提出依頼</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
