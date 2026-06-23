"use client";

import { useRouter } from "next/navigation";

export interface SwitchOption {
  id: string;
  name: string;
  grade?: string;
}

/**
 * 生徒を切り替えるセレクト。許可された生徒のみ options に渡すこと(呼び出し側で制御)。
 * mode="path"  → href = `${base}${id}`        (例 /grades/<id>)
 * mode="query" → href = `${base}?student=${id}` (例 /history?student=<id>)
 */
export function StudentSwitcher({
  options,
  current,
  base,
  mode = "path",
  label = "生徒",
}: {
  options: SwitchOption[];
  current: string;
  base: string;
  mode?: "path" | "query";
  label?: string;
}) {
  const router = useRouter();
  function go(id: string) {
    router.push(mode === "query" ? `${base}?student=${id}` : `${base}${id}`);
  }
  return (
    <label className="stu-switch">
      <span className="stu-switch-label">{label}</span>
      <select value={current} onChange={(e) => go(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}{o.grade ? `（${o.grade}）` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
