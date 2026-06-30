"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setActiveDivision } from "@/lib/actions/ui-actions";
import type { Division } from "@/lib/division";

/** 運営ナビの「小学部／中高部」切り替え。選択を cookie 保存し、画面を更新する。 */
export function DivisionSwitch({ active }: { active: Division }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const pick = (d: Division) => {
    if (d === active || pending) return;
    start(async () => {
      await setActiveDivision(d);
      router.refresh();
    });
  };

  return (
    <div className="division-switch" role="group" aria-label="部門切り替え">
      <button
        type="button"
        className={active === "elementary" ? "active" : ""}
        aria-pressed={active === "elementary"}
        disabled={pending}
        onClick={() => pick("elementary")}
      >
        小学部
      </button>
      <button
        type="button"
        className={active === "secondary" ? "active" : ""}
        aria-pressed={active === "secondary"}
        disabled={pending}
        onClick={() => pick("secondary")}
      >
        中高部
      </button>
    </div>
  );
}
