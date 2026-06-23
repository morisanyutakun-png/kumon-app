import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles } from "@/db/schema";
import { getPrincipal } from "@/lib/access";
import { readStored } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * 課題ファイル(PDF等)の配信。同 org のログインユーザーなら閲覧可
 * (課題は同教室内で共有される教材のため)。?dl=1 で保存(添付)ダウンロード。
 */
export async function GET(
  req: Request,
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

  const file = await readStored(row);
  if (!file) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("dl") === "1";
  const disp = download ? "attachment" : "inline";

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": row.contentType || file.contentType,
      "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
