import Image from "next/image";

import type { Division } from "@/lib/division";
import { Logo } from "@/components/logo";

/**
 * 部門に応じたブランド表示。
 *   小学部: ノビットスタディのロゴ (public/brand/logo.png)
 *   中高部: 中高部ロゴ。public/brand/logo-secondary.(png|svg) があればそれを使い、
 *           無ければテキストのワードマークを表示する。
 *
 * 中高部ロゴ画像を差し替えるときは public/brand/logo-secondary.png を置き、
 * 下の HAS_SECONDARY_IMAGE を true にする。
 */
const HAS_SECONDARY_IMAGE = false;

export function Brand({
  division,
  className,
}: {
  division: Division;
  className?: string;
}) {
  if (division !== "secondary") {
    return <Logo className={className} />;
  }
  if (HAS_SECONDARY_IMAGE) {
    return (
      <Image
        src="/brand/logo-secondary.png"
        alt="ノビット 中高部"
        width={760}
        height={300}
        priority
        sizes="(max-width: 480px) 70vw, 240px"
        className={className}
      />
    );
  }
  return (
    <span className="brand-wordmark brand-secondary" aria-label="ノビットスタディ 中高部">
      <span className="bw-main">ノビットスタディ</span>
      <span className="bw-badge">中高部</span>
    </span>
  );
}
