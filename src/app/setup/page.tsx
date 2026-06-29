import Link from "next/link";

import { Logo } from "@/components/logo";
import {
  gradeLabel,
  isPaid,
  provisionAccount,
  verifySetupToken,
} from "@/lib/provision";
import { fetchProvisionSession } from "@/lib/yuta-eng";

import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = { [k: string]: string | string[] | undefined };

/**
 * 決済後のアカウント設定ページ。2系統のクエリに両対応:
 *   - ?session_id=cs_xxx  決済直後の戻り → 照会APIで確認し冪等に発行→token取得
 *   - ?token=<setup_token> メールのリンク → token を検証
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : undefined;
  const token = typeof sp.token === "string" ? sp.token : undefined;

  // 1) token フロー(メールのリンク)
  if (token) {
    const ctx = await verifySetupToken(token);
    if (!ctx) return <Shell><InvalidToken /></Shell>;
    return (
      <Shell>
        <SetupForm
          token={token}
          email={ctx.email}
          studentName={ctx.studentName}
          subjectLabels={ctx.subjectLabels}
          grade={ctx.grade}
        />
      </Shell>
    );
  }

  // 2) session_id フロー(決済直後の戻り)
  if (sessionId) {
    const lookup = await fetchProvisionSession(sessionId);
    if (!lookup.ok) {
      if (lookup.reason === "unpaid") return <Shell><LookupError msg="お支払いが確認できませんでした。" /></Shell>;
      if (lookup.reason === "not_found") return <Shell><LookupError msg="お申し込み情報が見つかりませんでした。" /></Shell>;
      return <Shell><LookupError msg="お申し込み情報の確認中にエラーが発生しました。" /></Shell>;
    }
    if (!isPaid(lookup.payload)) {
      return <Shell><LookupError msg="お支払いが確認できませんでした。" /></Shell>;
    }

    // アカウント発行で想定外の例外が出ても 500 にせず、復旧可能なエラーUIを返す。
    let result;
    try {
      result = await provisionAccount(lookup.payload);
    } catch (e) {
      console.error(`[provision] /setup 発行エラー: ${e instanceof Error ? e.stack ?? e.message : "unknown"}`);
      return <Shell><LookupError msg="アカウントの発行中にエラーが発生しました。時間をおいて、決済完了メールのリンクから再度お試しください。" /></Shell>;
    }
    if (result.status === "already_active") {
      return <Shell><AlreadyActive /></Shell>;
    }
    if (!result.setupToken) {
      return <Shell><LookupError msg="アカウントの発行中にエラーが発生しました。" /></Shell>;
    }
    return (
      <Shell>
        <SetupForm
          token={result.setupToken}
          email={result.email}
          studentName={lookup.payload.studentName || lookup.payload.name}
          subjectLabels={lookup.payload.subjectLabels}
          grade={gradeLabel(lookup.payload.grade ?? "")}
        />
      </Shell>
    );
  }

  // どちらのクエリも無い
  return (
    <Shell>
      <LookupError msg="このページは決済完了後のリンクから開いてください。" hideContact />
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
        <h1 className="auth-h1">アカウント設定</h1>
        {children}
        <div className="auth-foot">© {new Date().getFullYear()} Nobit Study</div>
      </div>
    </div>
  );
}

function AlreadyActive() {
  return (
    <>
      <p className="auth-help">このメールアドレスのアカウントは、すでに登録済みです。</p>
      <p className="auth-help" style={{ marginTop: 8 }}>
        <Link href="/login" className="auth-submit" style={{ display: "inline-block", textDecoration: "none" }}>
          ログインへ
        </Link>
      </p>
    </>
  );
}

function InvalidToken() {
  return (
    <>
      <p className="auth-error" role="alert">
        このリンクは有効期限が切れているか、すでに使用済みです。
      </p>
      <p className="auth-help" style={{ marginTop: 8 }}>
        すでにパスワードを設定済みの場合は、そのまま <Link href="/login">ログイン</Link> してください。
      </p>
      <p className="auth-help">
        お困りの場合は、お手数ですが <a href="https://yuta-eng.com/contact">サポート窓口</a> までご連絡ください。
      </p>
    </>
  );
}

function LookupError({ msg, hideContact }: { msg: string; hideContact?: boolean }) {
  return (
    <>
      <p className="auth-error" role="alert">{msg}</p>
      {!hideContact && (
        <p className="auth-help" style={{ marginTop: 8 }}>
          お手数ですが、しばらくしてから決済完了メールのリンクを開くか、
          <a href="https://yuta-eng.com/contact"> サポート窓口</a> までご連絡ください。
        </p>
      )}
    </>
  );
}
