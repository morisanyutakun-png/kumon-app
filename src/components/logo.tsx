import Image from "next/image";

/**
 * ブランドロゴ。next/image で自動最適化(WebP/AVIF・サイズ最適化・キャッシュ)。
 * priority でログイン画面では先読みし表示を速くする。
 * 差し替えるときは public/brand/logo.png を上書き(同名・透過PNG推奨)。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="ノビットスタディ"
      width={800}
      height={533}
      priority
      sizes="(max-width: 480px) 80vw, 264px"
      className={className}
    />
  );
}
