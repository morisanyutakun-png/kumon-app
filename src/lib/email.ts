/**
 * メール送信(Resend の HTTP API を直接叩く・SDK 依存なし)。
 * RESEND_API_KEY 未設定なら送信をスキップして {ok:false} を返す(呼び出し側は継続可能)。
 */
import "server-only";

import { maskEmail } from "./provision";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendSetupEmail(opts: {
  to: string;
  link: string;
  studentName?: string;
  subjectLabels?: string;
}): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SETUP_EMAIL_FROM ?? "ノビットスタディ <onboarding@resend.dev>";
  if (!key) {
    console.warn("[provision] RESEND_API_KEY 未設定のため設定メールをスキップしました。");
    return { ok: false };
  }

  const greeting = opts.studentName ? `${opts.studentName} さん` : "ご契約者さま";
  const subjects = opts.subjectLabels ? `<p>ご契約科目: <b>${escapeHtml(opts.subjectLabels)}</b></p>` : "";
  const html = `
    <div style="font-family:-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;line-height:1.7;color:#0f172a;">
      <h2 style="color:#1c9dd8;">ノビットスタディ パスワード設定のご案内</h2>
      <p>${escapeHtml(greeting)}、お申し込みありがとうございます。</p>
      <p>下のボタンからパスワードを設定すると、学習をはじめられます。</p>
      ${subjects}
      <p style="margin:24px 0;">
        <a href="${opts.link}" style="background:#1c9dd8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">パスワードを設定する</a>
      </p>
      <p style="color:#64748b;font-size:13px;">このリンクは ${72} 時間で期限切れになります。ボタンが押せない場合は次のURLを開いてください:<br>${escapeHtml(opts.link)}</p>
    </div>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: "【ノビットスタディ】パスワード設定のご案内",
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[provision] 設定メール送信失敗 status=${res.status} to=${maskEmail(opts.to)}`);
      return { ok: false };
    }
    console.info(`[provision] 設定メール送信 to=${maskEmail(opts.to)}`);
    return { ok: true };
  } catch (e) {
    console.error(`[provision] 設定メール送信エラー: ${e instanceof Error ? e.message : "unknown"}`);
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
