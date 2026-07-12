import { canAccessStudent, getPrincipal, isOperator } from "@/lib/access";
import {
  buildStudentSolutionBundlePdf,
  markStudentBundlePickedForGrading,
  type StudentBundleOptions,
} from "@/lib/pdf-bundles";

export const runtime = "nodejs";

/** 採点対象の答案に対応する解答解説PDFを、生徒ごとに結合して配信。 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await ctx.params;
  const p = await getPrincipal();
  if (!p) return new Response("Unauthorized", { status: 401 });
  if (!isOperator(p)) return new Response("Forbidden", { status: 403 });
  if (!(await canAccessStudent(p, studentId))) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
  const scope = url.searchParams.get("scope");
  const options: StudentBundleOptions = {
    statuses: scope === "submitted" ? ["submitted"] : scope === "grading" ? ["grading"] : ["submitted", "grading"],
    submissionIds: ids,
  };

  const bundle = await buildStudentSolutionBundlePdf(p.organizationId, studentId, options);
  if (!bundle) return new Response("Not found", { status: 404 });

  await markStudentBundlePickedForGrading(
    p.organizationId,
    studentId,
    bundle.submissions.map((s) => s.submissionId),
    p.id,
  );

  const dl = url.searchParams.get("dl") === "1";
  return new Response(bundle.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''solutions-${studentId}.pdf`,
      "Cache-Control": "private, max-age=30",
    },
  });
}
