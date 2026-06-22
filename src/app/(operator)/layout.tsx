import Link from "next/link";

import { requireOperator } from "@/lib/access";
import { DemoBanner } from "@/components/demo-banner";
import { LogoutButton } from "@/components/logout-button";
import { SheetTabs, type SheetTabItem } from "@/components/sheet-tabs";

const TABS: SheetTabItem[] = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/grading", label: "採点", exact: true },
  { href: "/grading/batch", label: "一括採点" },
  { href: "/students", label: "生徒" },
  { href: "/guardians", label: "保護者" },
  { href: "/materials", label: "教材" },
  { href: "/assignments", label: "課題割当" },
];

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await requireOperator();

  return (
    <div className="flex flex-1 flex-col">
      <DemoBanner />
      <main className="iplus-main wide flex-1">{children}</main>

      <div className="sheet-tabbar" role="navigation" aria-label="メニュー">
        <Link href="/dashboard" className="sheet-brand" aria-label="まなび教室">
          <span className="brand-mark">ま</span>
          <strong>まなび教室</strong>
        </Link>
        <SheetTabs items={TABS} />
        <div className="sheet-status">
          <span className="db-badge" title={p.role === "admin" ? "管理者" : "運営・採点者"}>
            {p.name}
          </span>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
