/**
 * ブランドロゴ。public/brand/logo.png を表示する。
 * 差し替えるときは public/brand/logo.png を上書き。
 */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/logo.png" alt="ノビットスタディ" className={className} />;
}
