import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { enterAsGuest } from "@/lib/actions/auth-actions";
import { BrandMark } from "./brand";
import { LoginForm } from "./login-form";

const GUESTS: { role: "operator" | "student" | "parent"; label: string }[] = [
  { role: "operator", label: "運営者として体験" },
  { role: "student", label: "生徒として体験" },
  { role: "parent", label: "保護者として体験" },
];

export default async function LoginPage() {
  const demo = isDemoMode();
  const p = await getPrincipal();
  if (p && !demo) redirect("/");

  return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-brand">
          <BrandMark className="auth-logo" />
          <span className="auth-word">まなび教室</span>
        </div>

        <h1 className="auth-h1">ログイン</h1>
        <p className="auth-sub">先生・保護者・お子さま、共通のログイン画面です。</p>

        <LoginForm />

        <p className="login-foot">
          ログイン情報がわからないときは、教室の先生におたずねください。
        </p>

        {demo && (
          <div className="login-demo">
            <div className="login-demo-label">デモ体験（ゲスト）</div>
            <div className="login-demo-btns">
              {GUESTS.map((g) => (
                <form key={g.role} action={enterAsGuest.bind(null, g.role)}>
                  <button type="submit" className="btn-secondary">{g.label}</button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
