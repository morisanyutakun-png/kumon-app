import { redirect } from "next/navigation";

/** ダッシュボードは廃止。採点をトップにする。 */
export default function DashboardRedirect() {
  redirect("/grading");
}
