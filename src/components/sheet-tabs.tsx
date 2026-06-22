"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SheetTabItem {
  href: string;
  label: string;
  /** 完全一致のみ active にする (前方一致を避けたいタブ用)。 */
  exact?: boolean;
}

/** 旧PHPの下部スプレッドシート風タブ。 */
export function SheetTabs({ items }: { items: SheetTabItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="sheet-tabs">
      {items.map((it) => {
        const active = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
