import { canAccessStudent, getPrincipal } from "@/lib/access";
import { buildStudentSolutionBundlePdf } from "@/lib/pdf-bundles";

export const runtime = "nodejs";

/** 採点待ち答案に対応する解答解説PDFを、生徒ごとに区切りページつきで結合して配信。 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });
  if (!(await canAccessStudent(p, studentId))) return new Response("Forbidden", { status: 403 });

  const bytes = await buildStudentSolutionBundlePdf(p.organizationId, studentId);
  if (!bytes) return new Response("Not found", { status: 404 });

  const dl = new URL(req.url).searchParams.get("dl") === "1";
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''solutions-${studentId}.pdf`,
      "Cache-Control": "private, max-age=30",
    },
  });
}
