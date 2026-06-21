import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles } from "@/db/schema";
import { getPrincipal } from "@/lib/access";
import { readBlob } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * 課題ファイル(PDF等)の配信。同 org のログインユーザーなら閲覧可
 * (課題は同教室内で共有される教材のため)。
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });

  const [row] = await db
    .select()
    .from(materialFiles)
    .where(
      and(
        eq(materialFiles.id, fileId),
        eq(materialFiles.organizationId, p.organizationId),
      ),
    )
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  const file = await readBlob(row.blobUrl, row.pathname);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": row.contentType || file.contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.fileName)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
