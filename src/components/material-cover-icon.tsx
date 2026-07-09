import Image from "next/image";
import type { CSSProperties } from "react";

import { materialCoverFor, subjectAccentColor } from "@/lib/material-covers";

export function MaterialCoverIcon({
  materialName,
  subject,
  className = "",
}: {
  materialName: string;
  subject: string;
  className?: string;
}) {
  const cover = materialCoverFor({ materialName, subject });
  const accent = cover?.accent ?? subjectAccentColor(subject);
  const style = { "--cover-accent": accent } as CSSProperties;
  const classes = ["material-cover", cover ? "" : "material-cover-fallback", className]
    .filter(Boolean)
    .join(" ");

  if (!cover) {
    return (
      <span className={classes} style={style} aria-hidden="true">
        {(subject || "課").slice(0, 1)}
      </span>
    );
  }

  return (
    <span className={classes} style={style} title={cover.title}>
      <Image
        src={cover.imageUrl}
        alt=""
        width={64}
        height={88}
        className="material-cover-img"
        sizes="64px"
        unoptimized
      />
    </span>
  );
}
