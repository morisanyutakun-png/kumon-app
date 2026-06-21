import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubmissionRow } from "@/lib/queries";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SubmissionTable({
  rows,
  hrefBase,
  emptyText = "該当する提出物はありません。",
}: {
  rows: SubmissionRow[];
  hrefBase: string;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>生徒</TableHead>
          <TableHead>課題</TableHead>
          <TableHead>状態</TableHead>
          <TableHead className="text-center">提出回数</TableHead>
          <TableHead>提出日時</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.submissionId}>
            <TableCell>
              <div className="font-medium">{r.studentName}</div>
              <div className="text-xs text-slate-500">{r.studentGrade}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{r.assignmentTitle || r.materialName}</div>
              <div className="text-xs text-slate-500">
                {r.subject} / {r.rangeText || r.materialName}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell className="text-center">{r.attemptCount}</TableCell>
            <TableCell className="text-sm">{fmtDate(r.submittedAt)}</TableCell>
            <TableCell className="text-right">
              <Link
                href={`${hrefBase}/${r.submissionId}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                開く
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
