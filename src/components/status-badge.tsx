import { cn } from "@/lib/utils";
import {
  SUBMISSION_STATUS_BADGE,
  SUBMISSION_STATUS_LABELS,
} from "@/lib/submission-state";
import type { SubmissionStatus } from "@/db/schema";

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        SUBMISSION_STATUS_BADGE[status],
      )}
    >
      {SUBMISSION_STATUS_LABELS[status]}
    </span>
  );
}
