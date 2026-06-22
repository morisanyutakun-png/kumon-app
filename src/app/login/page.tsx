import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { enterAsGuest } from "@/lib/actions/auth-actions";
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
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-mark">ま</span>
          <div>
            <div className="login-name">まなび教室</div>
            <div className="login-tag">学習管理システム</div>
          </div>
        </div>

        <h1 className="login-title">ログイン</h1>
        <p className="login-lead">
          先生・保護者・お子さま、どなたも同じ画面からログインできます。
        </p>

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
