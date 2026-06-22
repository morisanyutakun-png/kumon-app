"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavTabItem {
  href: string;
  label: string;
  exact?: boolean;
}

/** 上部ヘッダーの下線タブ (直角・きっちり)。 */
export function NavTabs({ items }: { items: NavTabItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="topnav">
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
