import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { submissionImages } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listSubmissions } from "@/lib/queries";
import { BatchGradeTable, type BatchRow } from "./batch-table";

export default async function BatchGradingPage() {
  const p = await requireOperator();
  // 提出済み(未採点)をまとめて採点する。
  const subs = await listSubmissions(p.organizationId, {
    statuses: ["submitted"],
  });

  // 各提出物の画像(最新提出回)をサムネイル用に取得。
  const ids = subs.map((s) => s.submissionId);
  const imgs =
    ids.length > 0
      ? await db
          .select()
          .from(submissionImages)
          .where(inArray(submissionImages.submissionId, ids))
          .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder))
      : [];

  const rows: BatchRow[] = subs.map((s) => {
    const all = imgs.filter((i) => i.submissionId === s.submissionId);
    const latestAttempt = all.reduce((m, i) => Math.max(m, i.attemptNo), 0);
    const images = all
      .filter((i) => i.attemptNo === latestAttempt)
      .map((i) => ({ id: i.id, fileName: i.fileName }));
    return {
      submissionId: s.submissionId,
      studentName: s.studentName,
      studentGrade: s.studentGrade,
      materialName: s.materialName,
      subject: s.subject,
      rangeText: s.rangeText,
      sessionNo: s.sessionNo,
      attemptCount: s.attemptCount,
      images,
    };
  });

  return (
    <div>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <h1>一括採点（添削シート）</h1>
          <p>
            提出済みの答案を列ごとに採点します。得点・合否・コメントを入力し、操作を選んで
            「まとめて返却」。合格で返却した列は学習進度が自動で1つ進みます。
          </p>
        </div>
        <Link href="/grading" className="db-badge">
          通常の採点一覧へ →
        </Link>
      </div>

      <BatchGradeTable rows={rows} />
    </div>
  );
}
