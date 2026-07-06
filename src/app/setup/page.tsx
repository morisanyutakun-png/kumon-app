import Link from "next/link";
import { headers } from "next/headers";

import { Logo } from "@/components/logo";
import { isPaid, provisionAccount } from "@/lib/provision";
import { sendProvisionEmails } from "@/lib/provision-notify";
import { fetchProvisionSession } from "@/lib/yuta-eng";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = { [k: string]: string | string[] | undefined };

async function appBaseUrl() {
  const configured = process.env.AUTH_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";

  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto.split(",")[0]}://${host.split(",")[0]}`;
}

/**
 * 決済直後の戻り先 /setup?session_id=cs_xxx。
 * 照会APIで確認 → 冪等にアカウント発行(生成パスワード) → ログイン情報を画面表示。
 * 同じ内容はメールでも送られる(Webhook 経由)。
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : undefined;

  if (!sessionId) {
    return (
      <Shell>
        <LookupError msg="このページは決済完了後のリンクから開いてください。" hideContact />
        <p className="auth-help" style={{ marginTop: 8 }}>
          すでにご登録済みの方は <Link href="/login">ログイン</Link> してください。
        </p>
      </Shell>
    );
  }

  const lookup = await fetchProvisionSession(sessionId);
  if (!lookup.ok) {
    if (lookup.reason === "unpaid") return <Shell><LookupError msg="お支払いが確認できませんでした。" /></Shell>;
    if (lookup.reason === "not_found") return <Shell><LookupError msg="お申し込み情報が見つかりませんでした。" /></Shell>;
    return <Shell><LookupError msg="お申し込み情報の確認中にエラーが発生しました。" /></Shell>;
  }
  if (!isPaid(lookup.payload)) {
    return <Shell><LookupError msg="お支払いが確認できませんでした。" /></Shell>;
  }

  // アカウント発行(冪等)。想定外の例外でも 500 にせず復旧可能なUIを返す。
  let result;
  try {
    result = await provisionAccount(lookup.payload);
  } catch (e) {
    console.error(`[provision] /setup 発行エラー: ${e instanceof Error ? e.stack ?? e.message : "unknown"}`);
    return <Shell><LookupError msg="アカウントの発行中にエラーが発生しました。時間をおいて、ログイン情報メールのリンクからお試しください。" /></Shell>;
  }

  // ここでもメール送信(顧客＋運営者)。Webhook が来なくても確実に届く。
  // 既に発行済みでも資格情報が取れる場合は、メール未達の復旧として再送を試みる。
  let emailSent = false;
  if (result.loginId && result.pin) {
    const baseUrl = await appBaseUrl();
    const loginUrl = baseUrl ? `${baseUrl}/login` : "/login";
    const email = await sendProvisionEmails({ result, payload: lookup.payload, loginUrl });
    emailSent = email.customer;
  }

  if (result.loginId && result.pin) {
    return <Shell><Credentials loginId={result.loginId} pin={result.pin} emailSent={emailSent} /></Shell>;
  }
  // 既に発行済みで、PIN が手元にない(過去発行など)。ログインへ案内。
  return (
    <Shell>
      <p className="auth-help">このお申し込みのアカウントは、すでに発行済みです。</p>
      <p className="auth-help" style={{ marginTop: 4 }}>
        ログイン情報はお送りしたメールをご確認のうえ、<Link href="/login">ログイン</Link> してください。
        わからない場合は教室の先生にお問い合わせください。
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo className="auth-logo" />
        </div>
        <h1 className="auth-h1">アカウント発行</h1>
        {children}
        <div className="auth-foot">© {new Date().getFullYear()} Nobit Study</div>
      </div>
    </div>
  );
}

function Credentials({ loginId, pin, emailSent }: { loginId: string; pin: string; emailSent: boolean }) {
  return (
    <>
      <p className="auth-help" style={{ marginTop: 0 }}>
        お申し込みありがとうございます。下のログイン情報でご利用いただけます
        {emailSent ? "（同じ内容をメールでもお送りしました）。" : "。メール送信に失敗した可能性があるため、この画面の内容を保存してください。"}
      </p>
      <div className="setup-info">
        <div className="setup-info-row">
          <span className="setup-info-label">ログインID</span>
          <span className="setup-info-val" style={{ fontFamily: "monospace", fontSize: 16, letterSpacing: 1 }}>{loginId}</span>
        </div>
        <div className="setup-info-row">
          <span className="setup-info-label">パスワード（PIN）</span>
          <span className="setup-info-val" style={{ fontFamily: "monospace", fontSize: 16, letterSpacing: 2 }}>{pin}</span>
        </div>
      </div>
      <Link href="/login" className="auth-submit" style={{ display: "block", textAlign: "center", textDecoration: "none", lineHeight: "52px" }}>
        ログインする
      </Link>
      <p className="auth-help">ログインID と パスワード（PIN）はメモまたはスクリーンショットの保存をおすすめします。</p>
    </>
  );
}

function LookupError({ msg, hideContact }: { msg: string; hideContact?: boolean }) {
  return (
    <>
      <p className="auth-error" role="alert">{msg}</p>
      {!hideContact && (
        <p className="auth-help" style={{ marginTop: 8 }}>
          お手数ですが、しばらくしてからログイン情報メールをご確認いただくか、
          <a href="https://yuta-eng.com/contact"> サポート窓口</a> までご連絡ください。
        </p>
      )}
    </>
  );
}
