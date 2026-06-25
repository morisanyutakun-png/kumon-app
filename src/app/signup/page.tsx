import Link from "next/link";
import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { Logo } from "@/components/logo";
import { SignupForm } from "./signup-form";

/**
 * 運営アカウント(教室)の新規登録ページ。
 * 共有DB上に新しい組織(テナント)を作り、その管理者(運営)を登録する。
 */
export default async function SignupPage() {
  const demo = isDemoMode();
  const p = await getPrincipal();
  if (p && !demo) redirect("/");

  return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo className="auth-logo" />
        </div>

        <h1 className="auth-h1">運営アカウントの新規登録</h1>
        <p className="auth-help" style={{ marginTop: -6, marginBottom: 14 }}>
          教室ごとに独立した管理スペースを作成します。登録後、配下に添削者・保護者・生徒を作成できます。
        </p>

        <SignupForm />

        <p className="auth-help">
          すでにアカウントをお持ちですか？ <Link href="/login">ログイン</Link>
        </p>

        <div className="auth-foot">
          ノビットスタディについて<span className="auth-foot-sep">｜</span>© {new Date().getFullYear()} Nobit Study
        </div>
      </div>
    </div>
  );
}
