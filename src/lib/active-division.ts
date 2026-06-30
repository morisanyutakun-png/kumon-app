import { cookies } from "next/headers";

import type { Division } from "./division";

const COOKIE = "division";

/** 運営が選択中の部門(小学部/中高部)を cookie から読む。既定は小学部。 */
export async function getActiveDivision(): Promise<Division> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v === "secondary" ? "secondary" : "elementary";
}

export const DIVISION_COOKIE = COOKIE;
