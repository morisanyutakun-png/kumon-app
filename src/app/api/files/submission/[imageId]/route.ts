import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { submissionImages, submissions } from "@/db/schema";
import { canAccessStudent, getPrincipal, isOperator } from "@/lib/access";
import { readBlob } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * 答案画像の配信。必ず認証 + 権限確認を通す。
 * 他生徒の画像は閲覧不可 (運営者は同 org 内のみ許可)。
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });

  const [row] = await db
    .select({
      blobUrl: submissionImages.blobUrl,
      pathname: submissionImages.pathname,
      contentType: submissionImages.contentType,
      studentId: submissions.studentId,
    })
    .from(submissionImages)
    .innerJoin(submissions, eq(submissionImages.submissionId, submissions.id))
    .where(
      and(
        eq(submissionImages.id, imageId),
        eq(submissionImages.organizationId, p.organizationId),
      ),
    )
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  if (!isOperator(p)) {
    const ok = await canAccessStudent(p, row.studentId);
    if (!ok) return new Response("Forbidden", { status: 403 });
  }

  const file = await readBlob(row.blobUrl, row.pathname);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": row.contentType || file.contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
