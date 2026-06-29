/**
 * メール送信(Resend の HTTP API を直接叩く・SDK 依存なし)。
 * RESEND_API_KEY 未設定なら送信をスキップして {ok:false} を返す(呼び出し側は継続可能)。
 * 例外は内部で握り、決して呼び出し元(ページ/Webリクエスト)を落とさない。
 */
import "server-only";

import { maskEmail } from "./provision";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.SETUP_EMAIL_FROM ?? "ノビットスタディ <onboarding@resend.dev>";
}

/** Resend へ送信(共通)。失敗・未設定でも throw せず {ok} を返す。 */
async function send(to: string[], subject: string, html: string): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[provision] RESEND_API_KEY 未設定のためメール送信をスキップしました。");
    return { ok: false };
  }
  if (to.length === 0) return { ok: false };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to, subject, html }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[provision] メール送信失敗 status=${res.status} to=${to.map(maskEmail).join(",")} body=${body}`);
      return { ok: false };
    }
    console.info(`[provision] メール送信 to=${to.map(maskEmail).join(",")}`);
    return { ok: true };
  } catch (e) {
    console.error(`[provision] メール送信エラー: ${e instanceof Error ? e.message : "unknown"}`);
    return { ok: false };
  }
}

/** 生徒(顧客)へ ログインID(st~)＋PIN＋ログインURL を送る。 */
export async function sendCredentialsEmail(opts: {
  to: string;
  loginId: string;
  pin: string;
  loginUrl: string;
  studentName?: string;
  subjectLabels?: string;
}): Promise<{ ok: boolean }> {
  const greeting = opts.studentName ? `${escapeHtml(opts.studentName)} さん` : "ご契約者さま";
  const subjects = opts.subjectLabels ? `<p>ご契約科目: <b>${escapeHtml(opts.subjectLabels)}</b></p>` : "";
  const html = `
    <div style="font-family:-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;line-height:1.7;color:#0f172a;">
      <h2 style="color:#1c9dd8;">ノビットスタディ ログイン情報のご案内</h2>
      <p>${greeting}、お申し込みありがとうございます。下のログイン情報でご利用いただけます。</p>
      ${subjects}
      <div style="margin:18px 0;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;">
        <p style="margin:0 0 6px;">ログインID:<br><b style="font-size:18px;letter-spacing:1px;">${escapeHtml(opts.loginId)}</b></p>
        <p style="margin:0;">パスワード（PIN）:<br><b style="font-size:18px;letter-spacing:2px;">${escapeHtml(opts.pin)}</b></p>
      </div>
      <p style="margin:20px 0;">
        <a href="${opts.loginUrl}" style="background:#1c9dd8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">ログインする</a>
      </p>
      <p style="color:#64748b;font-size:13px;">このメールに心当たりがない場合は破棄してください。</p>
    </div>`;
  return send([opts.to], "【ノビットスタディ】ログイン情報のご案内", html);
}

/** 運営者へ「新しい生徒が発行された」通知(契約内容・金額・生徒情報つき)を送る。 */
export async function sendOperatorNotification(
  to: string[],
  d: {
    studentName?: string;
    grade?: string;
    loginId: string;
    pin?: string;
    email: string;
    applicantName?: string;
    phone?: string;
    subjectLabels?: string;
    subjectCount?: number | string;
    monthlyAmount?: number | string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeSessionId?: string;
  },
): Promise<{ ok: boolean }> {
  const amount = d.monthlyAmount !== undefined && d.monthlyAmount !== "" && Number(d.monthlyAmount) > 0
    ? `${Number(d.monthlyAmount).toLocaleString("ja-JP")} 円 / 月`
    : "—";
  const row = (label: string, value?: string) =>
    `<tr><td style="padding:5px 10px;color:#64748b;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:5px 10px;font-weight:700;">${value ?? "—"}</td></tr>`;
  const html = `
    <div style="font-family:-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;line-height:1.6;color:#0f172a;">
      <h2 style="color:#1c9dd8;">新しい生徒が発行されました（決済お申し込み）</h2>
      <p>以下の内容で生徒アカウントを発行しました。ログインID/PIN は「生徒・保護者」画面でも確認できます。</p>
      <h3 style="margin:18px 0 6px;font-size:15px;">ログイン情報</h3>
      <table style="border-collapse:collapse;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;">
        ${row("ログインID", `<span style="font-family:monospace;font-size:15px;">${escapeHtml(d.loginId)}</span>`)}
        ${row("PIN", d.pin ? `<span style="font-family:monospace;font-size:15px;letter-spacing:2px;">${escapeHtml(d.pin)}</span>` : "—")}
      </table>
      <h3 style="margin:18px 0 6px;font-size:15px;">生徒・契約情報</h3>
      <table style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        ${row("生徒氏名", escapeHtml(d.studentName || "(未設定)"))}
        ${row("学年", escapeHtml(d.grade || "—"))}
        ${row("申込者(保護者)", escapeHtml(d.applicantName || "—"))}
        ${row("連絡先メール", escapeHtml(d.email))}
        ${row("電話", escapeHtml(d.phone || "—"))}
        ${row("契約科目", escapeHtml(d.subjectLabels || "—"))}
        ${row("科目数", d.subjectCount !== undefined && d.subjectCount !== "" ? escapeHtml(String(d.subjectCount)) : "—")}
        ${row("月額", escapeHtml(amount))}
        ${row("Stripe顧客ID", escapeHtml(d.stripeCustomerId || "—"))}
        ${row("Stripeサブスク", escapeHtml(d.stripeSubscriptionId || "—"))}
        ${row("Stripeセッション", escapeHtml(d.stripeSessionId || "—"))}
      </table>
    </div>`;
  return send(to, `【ノビットスタディ】新規発行: ${d.studentName || d.email}`, html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
