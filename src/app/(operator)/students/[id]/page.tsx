import { redirect } from "next/navigation";

/** 生徒の詳細は成績管理に統合。/grades/[id] へ。 */
export default async function StudentDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/grades/${id}`);
}
