"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setActiveDivision } from "@/lib/actions/ui-actions";
import type { Division } from "@/lib/division";

import { useDivision } from "./division-theme";

/**
 * 運営ナビの「小学部／中高部」切り替え。クリックで即座にテーマ/ロゴが切り替わり(楽観的)、
 * 同時に cookie 保存＋画面データを更新する。
 */
export function DivisionSwitch() {
  const router = useRouter();
  const { division, setDivision } = useDivision();
  const [pending, start] = useTransition();

  const pick = (d: Division) => {
    if (d === division) return;
    setDivision(d); // 即座にテーマ・ロゴを反映
    start(async () => {
      await setActiveDivision(d);
      router.refresh(); // データ(生徒・教材一覧)をサーバーで再取得
    });
  };

  return (
    <div className="division-switch" role="group" aria-label="部門切り替え" data-pending={pending}>
      <button
        type="button"
        className={division === "elementary" ? "active" : ""}
        aria-pressed={division === "elementary"}
        onClick={() => pick("elementary")}
      >
        小学部
      </button>
      <button
        type="button"
        className={division === "secondary" ? "active" : ""}
        aria-pressed={division === "secondary"}
        onClick={() => pick("secondary")}
      >
        中高部
      </button>
    </div>
  );
}
