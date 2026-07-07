import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { returnedFiles, submissions } from "@/db/schema";
import { canAccessStudent, getPrincipal, isOperator } from "@/lib/access";
import { readStored } from "@/lib/blob";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });

  const [row] = await db
    .select({
      file: returnedFiles,
      studentId: submissions.studentId,
      status: submissions.status,
    })
    .from(returnedFiles)
    .innerJoin(submissions, eq(returnedFiles.submissionId, submissions.id))
    .where(and(eq(returnedFiles.id, fileId), eq(returnedFiles.organizationId, p.organizationId)))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  if (!isOperator(p)) {
    const ok = await canAccessStudent(p, row.studentId);
    if (!ok) return new Response("Forbidden", { status: 403 });
    if (
      row.status !== "returned" &&
      row.status !== "done" &&
      row.status !== "resubmit_required"
    ) {
      return new Response("Not found", { status: 404 });
    }
  }

  const file = await readStored(row.file);
  if (!file) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("dl") === "1";
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": row.file.contentType || file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.file.fileName)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
