import { redirect } from "next/navigation";

/**
 * 運営アカウントの新規登録は無効(招待制運用)。
 * 直接URLで来ても /login へ誘導する。教室の作成は運営側で行う。
 */
export default async function SignupPage() {
  redirect("/login");
}
