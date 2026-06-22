import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { enterAsGuest } from "@/lib/actions/auth-actions";
import { BrandMark, LoginArt } from "./brand";
import { LoginForm } from "./login-form";

const GUESTS: { role: "operator" | "student" | "parent"; label: string }[] = [
  { role: "operator", label: "運営者として体験" },
  { role: "student", label: "生徒として体験" },
  { role: "parent", label: "保護者として体験" },
];

const CHIPS: { icon: "doc" | "check" | "chart"; label: string }[] = [
  { icon: "doc", label: "課題・提出" },
  { icon: "check", label: "採点・返却" },
  { icon: "chart", label: "成績管理" },
];

function ChipIcon({ name }: { name: "doc" | "check" | "chart" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "doc")
    return (<svg {...common}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h4" /></svg>);
  if (name === "check")
    return (<svg {...common}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>);
  return (<svg {...common}><path d="M4 19V5M4 19h16" /><rect x="8" y="11" width="3" height="5" /><rect x="13" y="7" width="3" height="9" /></svg>);
}

export default async function LoginPage() {
  const demo = isDemoMode();
  const p = await getPrincipal();
  if (p && !demo) redirect("/");

  return (
    <div className="login-split">
      {/* 左: ブランドパネル (PC表示) */}
      <aside className="login-aside">
        <div className="login-aside-deco" aria-hidden />
        <div className="login-aside-brand">
          <BrandMark className="login-aside-mark" />
          <div>
            <div className="login-aside-name">まなび教室</div>
            <div className="login-aside-tag">MANABI LEARNING</div>
          </div>
        </div>

        <div className="login-hero">
          <LoginArt />
          <h2 className="login-hero-title">学びの毎日を、ひとつに。</h2>
          <div className="login-chips">
            {CHIPS.map((c) => (
              <span key={c.label} className="login-chip">
                <ChipIcon name={c.icon} />
                {c.label}
              </span>
            ))}
          </div>
        </div>

        <div className="login-aside-foot">© {new Date().getFullYear()} まなび教室</div>
      </aside>

      {/* 右: ログインフォーム */}
      <main className="login-main">
        <div className="login-box">
          <div className="login-mobile-brand">
            <BrandMark className="login-mark-sm" />
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
