import { redirect } from "next/navigation";

export default async function SubmissionWritePage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  redirect(`/grading/${submissionId}`);
}
