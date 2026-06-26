import { pingDb } from "@/db";

export const runtime = "nodejs";
// 常に動的に実行(キャッシュさせない)。
export const dynamic = "force-dynamic";

/**
 * DB 保温用エンドポイント (認証不要・軽量 select 1)。
 *
 * 目的: Neon の自動サスペンドからの「初回ログインだけ遅くてタイムアウト→
 *       無言の空回り」を防ぐ。
 * 使い方:
 *   - ログイン画面表示時にブラウザから fetch して、入力中に DB を起こす。
 *   - 外部の無料 pinger (cron-job.org / UptimeRobot 等) や Vercel Cron から
 *     数分おきに叩いておけば、常時ウォームに保てる。
 */
export async function GET() {
  const ok = await pingDb();
  return Response.json(
    { ok },
    { headers: { "Cache-Control": "no-store" } },
  );
}
