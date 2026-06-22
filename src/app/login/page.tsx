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
    <div className="login-split">
      {/* 左: ブランドパネル (PC表示) */}
      <aside className="login-aside">
        <div className="login-aside-brand">
          <span className="login-aside-mark">ま</span>
          <div>
            <div className="login-aside-name">まなび教室</div>
            <div className="login-aside-tag">学習管理システム</div>
          </div>
        </div>

        <div className="login-aside-copy">
          <h2>毎日の学習を、ひとつの教室に。</h2>
          <p>課題の配布から提出・採点・返却、成績の管理までをまとめて。</p>
          <ul className="login-features">
            <li>課題の配布と答案の提出</li>
            <li>タブレットでの採点・コメント返却</li>
            <li>成績と学習履歴の見える化</li>
          </ul>
        </div>

        <div className="login-aside-foot">
          © {new Date().getFullYear()} まなび教室
        </div>
      </aside>

      {/* 右: ログインフォーム */}
      <main className="login-main">
        <div className="login-box">
          <div className="login-mobile-brand">
            <span className="login-mark-sm">ま</span>
            <span className="login-mobile-name">まなび教室</span>
          </div>

          <h1 className="login-title">ログイン</h1>
          <p className="login-lead">
            先生・保護者・お子さま、どなたも同じ画面からご利用いただけます。
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
      </main>
    </div>
  );
}
