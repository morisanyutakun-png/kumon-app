"use client";

import { useEffect } from "react";

import { markSubmissionRead } from "@/lib/actions/submission-actions";

/** 生徒が提出物を開いたら、その提出物のお知らせを既読にする。 */
export function MarkRead({ submissionId }: { submissionId: string }) {
  useEffect(() => {
    void markSubmissionRead(submissionId);
  }, [submissionId]);
  return null;
}
