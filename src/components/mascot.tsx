import Image from "next/image";

/** ノビットくんのポーズ。 */
const POSES = {
  wave: { src: "/brand/nobit-wave.png", w: 600, h: 724 },
  point: { src: "/brand/nobit-point.png", w: 600, h: 660 },
} as const;

export function Mascot({
  pose = "wave",
  className,
  sizes = "140px",
}: {
  pose?: keyof typeof POSES;
  className?: string;
  sizes?: string;
}) {
  const m = POSES[pose];
  return (
    <Image
      src={m.src}
      alt="ノビットくん"
      width={m.w}
      height={m.h}
      priority
      sizes={sizes}
      className={className}
    />
  );
}
