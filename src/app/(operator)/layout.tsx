import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { getActiveDivision } from "@/lib/active-division";
import { BrandLogo } from "@/components/brand-logo";
import { DemoBanner } from "@/components/demo-banner";
import { DivisionSwitch } from "@/components/division-switch";
import { DivisionThemeProvider } from "@/components/division-theme";
import { LogoutButton } from "@/components/logout-button";
import { NavTabs, type NavTabItem } from "@/components/nav-tabs";

const BASE_TABS: NavTabItem[] = [
  { href: "/grading", label: "採点" },
  { href: "/students", label: "生徒・保護者" },
  { href: "/grades", label: "成績" },
  { href: "/materials", label: "教材" },
  { href: "/assignments", label: "課題割当" },
];

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await requireOperator();
  const activeDivision = await getActiveDivision();
  const tabs: NavTabItem[] =
    p.role === "admin"
      ? [...BASE_TABS, { href: "/staff", label: "スタッフ" }]
      : BASE_TABS;

  return (
    <DivisionThemeProvider initial={activeDivision} className="flex flex-1 flex-col">
      <DemoBanner />
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/grading" className="brand" aria-label="ノビットスタディ">
            <BrandLogo className="brand-logo" />
          </Link>
          <NavTabs items={tabs} />
          <div className="appbar-right">
            <DivisionSwitch />
            <span className="appbar-user">
              {p.name}
              <span className="appbar-role">{p.role === "admin" ? "管理者" : "採点者"}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="iplus-main wide flex-1">{children}</main>
    </DivisionThemeProvider>
  );
}
