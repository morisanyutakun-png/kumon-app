import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { assignments } from "@/db/schema";
import { canAccessStudent, getPrincipal, isOperator } from "@/lib/access";
import { readStored } from "@/lib/blob";
import { getAssignmentProgress } from "@/lib/material-progress";
import { getOrCreateMaterialCompleteFile } from "@/lib/pdf-bundles";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.organizationId, p.organizationId)))
    .limit(1);
  if (!assignment) return new Response("Not found", { status: 404 });

  if (!isOperator(p)) {
    const ok = await canAccessStudent(p, assignment.studentId);
    if (!ok) return new Response("Forbidden", { status: 403 });
  }

  const progress = await getAssignmentProgress(p.organizationId, assignmentId);
  if (!progress?.isComplete) return new Response("Not found", { status: 404 });

  const row = await getOrCreateMaterialCompleteFile(p.organizationId, assignment.materialId);
  if (!row) return new Response("Not found", { status: 404 });

  const file = await readStored(row);
  if (!file) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("dl") === "1";
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": row.contentType || file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
