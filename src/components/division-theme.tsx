"use client";

import { createContext, useContext, useState } from "react";

import type { Division } from "@/lib/division";

interface DivisionCtx {
  division: Division;
  setDivision: (d: Division) => void;
}
const Ctx = createContext<DivisionCtx>({ division: "elementary", setDivision: () => {} });

export function useDivision(): DivisionCtx {
  return useContext(Ctx);
}

/**
 * 運営UIの部門テーマ土台。data-division を持つラッパーを描画し、配下のCSS変数(--primary等)を
 * 中高部=ネイビー系に切り替える。切り替えは楽観的更新で即座にテーマ/ロゴが変わる(データは
 * サーバー更新で追従)。サーバーの確定値(initial)が変わったらレンダー時に同期する。
 */
export function DivisionThemeProvider({
  initial,
  className,
  children,
}: {
  initial: Division;
  className?: string;
  children: React.ReactNode;
}) {
  const [division, setDivision] = useState<Division>(initial);
  const [prevInitial, setPrevInitial] = useState<Division>(initial);
  // router.refresh() 後にサーバーの確定値へ同期(setState-in-render の許容パターン)。
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setDivision(initial);
  }
  return (
    <div className={`division-root ${className ?? ""}`} data-division={division}>
      <Ctx.Provider value={{ division, setDivision }}>{children}</Ctx.Provider>
    </div>
  );
}
