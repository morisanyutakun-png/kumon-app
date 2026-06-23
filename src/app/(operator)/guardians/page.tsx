import { redirect } from "next/navigation";

/** 生徒・保護者は1画面に統合したため /students へ。 */
export default function GuardiansRedirect() {
  redirect("/students");
}
