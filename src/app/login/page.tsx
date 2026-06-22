import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { enterAsGuest } from "@/lib/actions/auth-actions";
import { Logo } from "@/components/logo";
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
        <div className="auth-logo-wrap">
          <Logo className="auth-logo" />
        </div>

        <LoginForm />

        <p className="auth-help">
          ログイン情報がわからないときは、教室の先生におたずねください。
        </p>

        {demo && (
          <div className="auth-demo">
            <div className="auth-demo-label">デモ体験（ゲスト）</div>
            <div className="auth-demo-btns">
              {GUESTS.map((g) => (
                <form key={g.role} action={enterAsGuest.bind(null, g.role)}>
                  <button type="submit" className="btn-secondary">{g.label}</button>
                </form>
              ))}
            </div>
          </div>
        )}

        <div className="auth-foot">
          ノビットスタディについて<span className="auth-foot-sep">｜</span>© {new Date().getFullYear()} Nobit Study
        </div>
      </div>
    </div>
  );
}
