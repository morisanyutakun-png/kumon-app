"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { addAssignment, deleteAssignment } from "@/lib/actions/admin-actions";
import type { AssignMaterial } from "@/lib/queries";

/** 選択中の教材の「開始範囲」候補。number=No.、chapter=単元タイトル。範囲が無ければ null。 */
function rangeInfo(m: AssignMaterial | undefined): { count: number; label: (i: number) => string } | null {
  if (!m) return null;
  if (m.progressType === "number") {
    const s = m.numberStart ?? 0;
    const e = m.numberEnd ?? 0;
    return s > 0 && e >= s ? { count: e - s + 1, label: (i) => `No.${s + i}` } : null;
  }
  if (m.progressType === "manual") return null; // 手入力教材は範囲なし
  return m.units.length > 0 ? { count: m.units.length, label: (i) => m.units[i]?.trim() || `${i + 1}番目` } : null;
}

/** 「＋」セル: 教材を選んで割り当てを追加する小さなフォーム。開始範囲をボタンで選べる。 */
export function AgAddCell({
  studentId,
  materials,
}: {
  studentId: string;
  materials: AssignMaterial[];
}) {
  const [materialId, setMaterialId] = useState("");
  const [startIdx, setStartIdx] = useState(0);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(() => materials.find((m) => m.id === materialId), [materials, materialId]);
  const info = rangeInfo(selected);
  // 範囲が2つ以上あるときだけ開始位置ステッパーを出す(1つ以下は常に先頭から)。
  const showStepper = info != null && info.count >= 2;
  const idx = showStepper ? Math.min(startIdx, info!.count - 1) : 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!materialId) {
      toast.warning("教材を選んでください。");
      return;
    }
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("materialId", materialId);
    fd.set("startIndex", String(idx));
    startTransition(async () => {
      try {
        await addAssignment(fd);
        toast.success("割り当てました。");
        setMaterialId("");
        setStartIdx(0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "追加に失敗しました。");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="ag-add-form">
      <select
        value={materialId}
        onChange={(e) => { setMaterialId(e.target.value); setStartIdx(0); }}
      >
        <option value="">＋ 教材を選ぶ</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.subject ? `[${m.subject}] ` : ""}
            {m.name}
          </option>
        ))}
      </select>

      {showStepper && (
        <div className="ag-startpick" title="開始する範囲を選びます">
          <span className="ag-startpick-cap">開始</span>
          <button
            type="button" className="ag-startpick-btn" aria-label="前の範囲"
            disabled={idx <= 0} onClick={() => setStartIdx(Math.max(0, idx - 1))}
          >◀</button>
          <span className="ag-startpick-val" title={info!.label(idx)}>{info!.label(idx)}</span>
          <button
            type="button" className="ag-startpick-btn" aria-label="次の範囲"
            disabled={idx >= info!.count - 1} onClick={() => setStartIdx(Math.min(info!.count - 1, idx + 1))}
          >▶</button>
          <span className="ag-startpick-pos">{idx + 1}/{info!.count}</span>
        </div>
      )}

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
