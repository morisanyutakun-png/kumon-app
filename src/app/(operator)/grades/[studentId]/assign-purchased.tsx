"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { assignPurchasedSubjectsAction } from "@/lib/actions/admin-actions";

/** 購入科目に一致する教材をこの生徒へ一括割り当て(運営の手動操作)。 */
export function AssignPurchasedButton({ studentId }: { studentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await assignPurchasedSubjectsAction(studentId);
          if (r.error) {
            toast.error(r.error);
          } else if (r.assigned === 0) {
            toast.info(`新しく割り当てる教材はありませんでした(該当教材 ${r.matched} 件 / 既割り当て ${r.skipped} 件)。`);
          } else {
            toast.success(`${r.assigned} 件の教材を割り当てました(スキップ ${r.skipped} 件 / 該当 ${r.matched} 件)。`);
          }
        })
      }
    >
      {pending ? "割り当て中…" : "購入科目の教材を割り当て"}
    </button>
  );
}
