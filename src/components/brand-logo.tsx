"use client";

import Image from "next/image";

import { useDivision } from "./division-theme";

/** 部門に応じてロゴを切り替える(中高部は logo-secondary.png)。切替で即座に変わる。 */
export function BrandLogo({ className }: { className?: string }) {
  const { division } = useDivision();
  const src = division === "secondary" ? "/brand/logo-secondary.png" : "/brand/logo.png";
  return (
    <Image
      src={src}
      alt={division === "secondary" ? "ノビットスタディ 中高部" : "ノビットスタディ"}
      width={760}
      height={300}
      priority
      sizes="(max-width: 480px) 80vw, 264px"
      className={className}
    />
  );
}
