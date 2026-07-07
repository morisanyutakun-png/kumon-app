import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { submissions } from "@/db/schema";
import { canAccessStudent, getPrincipal, isOperator } from "@/lib/access";
import { buildSubmissionAnswerPdf } from "@/lib/pdf-bundles";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });

  const [sub] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.organizationId, p.organizationId)))
    .limit(1);
  if (!sub) return new Response("Not found", { status: 404 });

  if (!isOperator(p)) {
    const ok = await canAccessStudent(p, sub.studentId);
    if (!ok) return new Response("Forbidden", { status: 403 });
  }

  const pdf = await buildSubmissionAnswerPdf(p.organizationId, submissionId);
  if (!pdf) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("dl") === "1";
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''submission-${submissionId}.pdf`,
      "Cache-Control": "private, max-age=30",
    },
  });
}
