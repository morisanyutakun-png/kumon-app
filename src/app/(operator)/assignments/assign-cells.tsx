"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { addAssignment, deleteAssignment } from "@/lib/actions/admin-actions";

/** 「＋」セル: 教材を選んで割り当てを追加する小さなフォーム。 */
export function AgAddCell({
  studentId,
  materials,
}: {
  studentId: string;
  materials: { id: string; name: string; subject: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("studentId", studentId);
    if (!String(fd.get("materialId") || "")) {
      toast.warning("教材を選んでください。");
      return;
    }
    startTransition(async () => {
      try {
        await addAssignment(fd);
        toast.success("割り当てました。");
        form.reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "追加に失敗しました。");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="ag-add-form">
      <select name="materialId" defaultValue="">
        <option value="">＋ 教材を選ぶ</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.subject ? `[${m.subject}] ` : ""}
            {m.name}
          </option>
        ))}
      </select>
      <input name="rangeText" placeholder="範囲(任意)" />
      <button type="submit" className="ag-add-btn" disabled={pending}>
        {pending ? "追加中…" : "＋ 追加"}
      </button>
    </form>
  );
}

/** セルの × 削除ボタン。 */
export function AgDeleteButton({
  assignmentId,
  label,
}: {
  assignmentId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (!window.confirm(`「${label}」の割り当てを削除しますか？関連する提出も削除されます。`)) return;
    startTransition(async () => {
      try {
        await deleteAssignment(assignmentId);
        toast.success("削除しました。");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "削除に失敗しました。");
      }
    });
  }
  return (
    <button type="button" className="ag-x" onClick={onClick} disabled={pending} title="削除">
      ×
    </button>
  );
}
