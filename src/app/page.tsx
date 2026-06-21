import { redirect } from "next/navigation";

import { getPrincipal, isOperator } from "@/lib/access";

/** ロールに応じて入口へ振り分ける。 */
export default async function Home() {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (isOperator(p)) redirect("/dashboard");
  redirect("/home");
}
