import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";

import { db } from "@/db";
import { submissionImages, submissions } from "@/db/schema";
import { canAccessStudent, getPrincipal } from "@/lib/access";
import { readStored } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * その生徒の「採点待ち(提出済み/採点中)」の答案画像を、提出順に1つのPDFへ結合して配信。
 * 添削をまとめて行うための統合PDF。アクセスは運営者 or その生徒に限る。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });
  if (!(await canAccessStudent(p, studentId))) return new Response("Forbidden", { status: 403 });

  // 採点待ちの提出(提出済み/採点中)を提出順に
  const subs = await db
    .select({ id: submissions.id, createdAt: submissions.createdAt, attemptCount: submissions.attemptCount })
    .from(submissions)
    .where(
      and(
        eq(submissions.organizationId, p.organizationId),
        eq(submissions.studentId, studentId),
        inArray(submissions.status, ["submitted", "grading"]),
      ),
    )
    .orderBy(asc(submissions.createdAt));

  if (subs.length === 0) return new Response("Not found", { status: 404 });

  const subIds = subs.map((s) => s.id);
  const imgs = await db
    .select()
    .from(submissionImages)
    .where(inArray(submissionImages.submissionId, subIds))
    .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder));

  const pdf = await PDFDocument.create();

  for (const sub of subs) {
    // 各提出の最新提出回の画像だけを使う
    const all = imgs.filter((i) => i.submissionId === sub.id);
    const latestAttempt = all.reduce((m, i) => Math.max(m, i.attemptNo), 0);
    const pageImgs = all.filter((i) => i.attemptNo === latestAttempt);
    for (const im of pageImgs) {
      const file = await readStored(im);
      if (!file) continue;
      const bytes = new Uint8Array(file.body);
      let embedded;
      try {
        embedded =
          (im.contentType || "").includes("png") || im.fileName.toLowerCase().endsWith(".png")
            ? await pdf.embedPng(bytes)
            : await pdf.embedJpg(bytes);
      } catch {
        try {
          embedded = await pdf.embedJpg(bytes);
        } catch {
          continue;
        }
      }
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    }
  }

  if (pdf.getPageCount() === 0) return new Response("Not found", { status: 404 });

  const out = await pdf.save();
  const dl = new URL(req.url).searchParams.get("dl") === "1";
  return new Response(out as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''answers-${studentId}.pdf`,
      "Cache-Control": "private, max-age=30",
    },
  });
}
