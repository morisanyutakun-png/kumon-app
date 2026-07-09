import { canAccessStudent, getPrincipal } from "@/lib/access";
import { buildStudentAnswerBundlePdf } from "@/lib/pdf-bundles";

export const runtime = "nodejs";

/**
 * その生徒の「採点待ち(提出済み/採点中)」答案を、区切りページつきで1つのPDFへ結合して配信。
 * 一括添削後に提出ごとへ切り戻せるよう、サーバー側の保存処理と同じ順番で生成する。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });
  if (!(await canAccessStudent(p, studentId))) return new Response("Forbidden", { status: 403 });

  const bundle = await buildStudentAnswerBundlePdf(p.organizationId, studentId);
  if (!bundle) return new Response("Not found", { status: 404 });

  const dl = new URL(req.url).searchParams.get("dl") === "1";
  return new Response(bundle.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''answers-${studentId}.pdf`,
      "Cache-Control": "private, max-age=30",
    },
  });
}
