import { redirect } from "next/navigation";
import Link from "next/link";

import { getPrincipal, isOperator } from "@/lib/access";
import { DemoBanner } from "@/components/demo-banner";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { NavTabs, type NavTabItem } from "@/components/nav-tabs";

const TABS: NavTabItem[] = [
  { href: "/home", label: "課題" },
  { href: "/history", label: "成績" },
];

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (isOperator(p)) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <DemoBanner />
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/home" className="brand" aria-label="ノビットスタディ">
            <Logo className="brand-logo" />
          </Link>
          <NavTabs items={TABS} />
          <div className="appbar-right">
            <span className="appbar-user">
              {p.name}
              <span className="appbar-role">{p.role === "parent" ? "保護者" : "生徒"}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="iplus-main narrow flex-1">{children}</main>
    </div>
  );
}
