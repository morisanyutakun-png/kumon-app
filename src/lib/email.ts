/**
 * メール送信(Resend の HTTP API を直接叩く・SDK 依存なし)。
 * RESEND_API_KEY 未設定なら送信をスキップして {ok:false} を返す(呼び出し側は継続可能)。
 * 例外は内部で握り、決して呼び出し元(ページ/Webリクエスト)を落とさない。
 */
import "server-only";

import { maskEmail } from "./provision";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** ログイン情報(メール＋生成パスワード)とログインURLを送る。 */
export async function sendCredentialsEmail(opts: {
  to: string;
  loginEmail: string;
  password: string;
  loginUrl: string;
  studentName?: string;
  subjectLabels?: string;
}): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SETUP_EMAIL_FROM ?? "ノビットスタディ <onboarding@resend.dev>";
  if (!key) {
    console.warn("[provision] RESEND_API_KEY 未設定のためログイン情報メールをスキップしました。");
    return { ok: false };
  }

  const greeting = opts.studentName ? `${escapeHtml(opts.studentName)} さん` : "ご契約者さま";
  const subjects = opts.subjectLabels ? `<p>ご契約科目: <b>${escapeHtml(opts.subjectLabels)}</b></p>` : "";
  const html = `
    <div style="font-family:-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;line-height:1.7;color:#0f172a;">
      <h2 style="color:#1c9dd8;">ノビットスタディ ログイン情報のご案内</h2>
      <p>${greeting}、お申し込みありがとうございます。下のログイン情報でご利用いただけます。</p>
      ${subjects}
      <div style="margin:18px 0;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;">
        <p style="margin:0 0 6px;">ログインID（メールアドレス）:<br><b>${escapeHtml(opts.loginEmail)}</b></p>
        <p style="margin:0;">パスワード:<br><b style="font-size:18px;letter-spacing:1px;">${escapeHtml(opts.password)}</b></p>
      </div>
      <p style="margin:20px 0;">
        <a href="${opts.loginUrl}" style="background:#1c9dd8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">ログインする</a>
      </p>
      <p style="color:#64748b;font-size:13px;">ログイン後、必要に応じてパスワードを変更できます。心当たりがない場合はこのメールを破棄してください。</p>
    </div>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: "【ノビットスタディ】ログイン情報のご案内",
        html,
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      console.error(`[provision] ログイン情報メール送信失敗 status=${res.status} to=${maskEmail(opts.to)} body=${body}`);
      return { ok: false };
    }
    console.info(`[provision] ログイン情報メール送信 to=${maskEmail(opts.to)}`);
    return { ok: true };
  } catch (e) {
    console.error(`[provision] ログイン情報メール送信エラー: ${e instanceof Error ? e.message : "unknown"}`);
    return { ok: false };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
