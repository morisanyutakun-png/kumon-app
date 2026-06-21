import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { countByStatus, listSubmissions } from "@/lib/queries";
import { SUBMISSION_STATUS_LABELS } from "@/lib/submission-state";
import { SubmissionTable } from "@/components/submission-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubmissionStatus } from "@/db/schema";

const SUMMARY_CARDS: { status: SubmissionStatus; href: string }[] = [
  { status: "not_submitted", href: "/grading?status=not_submitted" },
  { status: "submitted", href: "/grading?status=submitted" },
  { status: "grading", href: "/grading?status=grading" },
  { status: "resubmit_required", href: "/grading?status=resubmit_required" },
  { status: "returned", href: "/grading?status=returned" },
  { status: "done", href: "/grading?status=done" },
];

export default async function DashboardPage() {
  const p = await requireOperator();
  const [counts, needGrading] = await Promise.all([
    countByStatus(p.organizationId),
    listSubmissions(p.organizationId, { statuses: ["submitted", "grading"] }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SUMMARY_CARDS.map((c) => (
          <Link key={c.status} href={c.href}>
            <Card className="transition-colors hover:bg-slate-50">
              <CardContent className="py-4">
                <div className="text-3xl font-bold">{counts[c.status]}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {SUBMISSION_STATUS_LABELS[c.status]}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">未採点 (提出済み・採点中)</CardTitle>
        </CardHeader>
        <CardContent>
          <SubmissionTable
            rows={needGrading}
            hrefBase="/grading"
            emptyText="未採点の提出物はありません。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
