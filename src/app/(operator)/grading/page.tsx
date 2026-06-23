import Link from "next/link";
import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { submissionImages } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import { listSubmissions } from "@/lib/queries";
import { BatchGradeTable, type BatchRow } from "./batch/batch-table";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

const DONE_LABEL: Record<string, { text: string; cls: string }> = {
  returned: { text: "返却済み", cls: "ok" },
  done: { text: "完了", cls: "done" },
  resubmit_required: { text: "やり直し中", cls: "ng" },
};

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const p = await requireOperator();
  const { tab } = await searchParams;
  const view = tab === "done" ? "done" : "todo";

  // 採点待ち = 生徒が提出して、まだ返していないもの。
  const todoSubs = await listSubmissions(p.organizationId, { statuses: ["submitted", "grading"] });
  // 返却済 = 返した/完了/やり直し中。
  const doneSubs =
    view === "done"
      ? await listSubmissions(p.organizationId, { statuses: ["returned", "done", "resubmit_required"] })
      : [];

  // 採点待ちの答案画像(最新提出回)
  const ids = todoSubs.map((s) => s.submissionId);
  const imgs =
    view === "todo" && ids.length > 0
      ? await db
          .select()
          .from(submissionImages)
          .where(inArray(submissionImages.submissionId, ids))
          .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder))
      : [];

  const todoRows: BatchRow[] = todoSubs.map((s) => {
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

  const tabCls = (on: boolean) => (on ? "btn-primary" : "btn-secondary");

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>採点</h1>
        <p>「採点待ち」で ○合格 / ×やり直し を付けて確定するだけ。返した結果は「返却済」で確認できます。</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Link href="/grading" className={tabCls(view === "todo")} style={{ padding: "8px 18px" }}>
          採点待ち <b style={{ marginLeft: 6 }}>{todoSubs.length}</b>
        </Link>
        <Link href="/grading?tab=done" className={tabCls(view === "done")} style={{ padding: "8px 18px" }}>
          返却済
        </Link>
      </div>

      {view === "todo" ? (
        <BatchGradeTable rows={todoRows} />
      ) : (
        <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
          <table className="record-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: "20%" }}>生徒</th>
                <th>教材・範囲</th>
                <th style={{ width: 120 }}>状態</th>
                <th style={{ width: 90 }}>日付</th>
                <th className="right" style={{ width: 80 }}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {doneSubs.map((s) => {
                const lab = DONE_LABEL[s.status] ?? { text: s.status, cls: "" };
                return (
                  <tr key={s.submissionId}>
                    <td style={{ fontWeight: 600 }}>{s.studentName}<span className="muted" style={{ fontWeight: 400 }}> ・ {s.studentGrade}</span></td>
                    <td>{s.materialName}<span className="muted"> ・ {s.rangeText || "範囲なし"}</span></td>
                    <td><span className={`done-badge ${lab.cls}`}>{lab.text}</span></td>
                    <td className="muted">{fmt(s.returnedAt ?? s.updatedAt)}</td>
                    <td className="right"><Link href={`/grading/${s.submissionId}`} className="db-badge">開く</Link></td>
                  </tr>
                );
              })}
              {doneSubs.length === 0 && (
                <tr><td colSpan={5} className="empty">まだ返却した答案はありません。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
