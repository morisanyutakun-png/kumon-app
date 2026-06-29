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

/** 運営者へ「新しい生徒が発行された」通知を送る。 */
export async function sendOperatorNotification(
  to: string[],
  opts: { studentName?: string; loginId: string; email: string; subjectLabels?: string },
): Promise<{ ok: boolean }> {
  const subjects = opts.subjectLabels ? `<p>科目: ${escapeHtml(opts.subjectLabels)}</p>` : "";
  const html = `
    <div style="font-family:-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;line-height:1.7;color:#0f172a;">
      <h2 style="color:#1c9dd8;">新しい生徒が発行されました</h2>
      <p>お申し込み(決済)により、生徒アカウントが発行されました。</p>
      <div style="margin:14px 0;padding:12px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;">
        <p style="margin:0 0 4px;">氏名: <b>${escapeHtml(opts.studentName || "(未設定)")}</b></p>
        <p style="margin:0 0 4px;">ログインID: <b>${escapeHtml(opts.loginId)}</b></p>
        <p style="margin:0;">連絡先メール: ${escapeHtml(opts.email)}</p>
        ${subjects}
      </div>
      <p style="color:#64748b;font-size:13px;">ログインID/PIN は「生徒・保護者」画面でも確認できます。</p>
    </div>`;
  return send(to, "【ノビットスタディ】新しい生徒が発行されました", html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
