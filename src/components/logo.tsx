/**
 * ブランドロゴ。public/brand/logo.svg を表示する。
 * 実ロゴに差し替えるときは public/brand/logo.svg を上書き
 * (PNGにする場合は src を /brand/logo.png に変更)。
 */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/logo.svg" alt="ノビットスタディ" className={className} />;
}
