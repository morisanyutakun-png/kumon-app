import { redirect } from "next/navigation";

/** 採点は /grading に統合(採点待ち / 返却済の2タブ)。 */
export default function BatchRedirect() {
  redirect("/grading");
}
