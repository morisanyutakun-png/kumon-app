import Image from "next/image";

/** ノビットのキャラクター(ロゴから切り出し)。 */
export function Mascot({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mascot.png"
      alt="ノビット"
      width={162}
      height={271}
      priority
      sizes="96px"
      className={className}
    />
  );
}
