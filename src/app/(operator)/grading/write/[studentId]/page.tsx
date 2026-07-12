import { redirect } from "next/navigation";

export default function GradingWritePage() {
  redirect("/grading?tab=markup");
}
