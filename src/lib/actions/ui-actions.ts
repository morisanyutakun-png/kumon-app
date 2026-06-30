"use server";

import { cookies } from "next/headers";

import { requireOperator } from "@/lib/access";
import { DIVISION_COOKIE } from "@/lib/active-division";
import type { Division } from "@/lib/division";

/** 運営が表示部門(小学部/中高部)を切り替える。cookie に保存し、各画面はこれで絞り込む。 */
export async function setActiveDivision(division: Division): Promise<void> {
  await requireOperator();
  const value: Division = division === "secondary" ? "secondary" : "elementary";
  (await cookies()).set(DIVISION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
