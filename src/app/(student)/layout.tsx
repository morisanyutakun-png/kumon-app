import { redirect } from "next/navigation";
import Link from "next/link";

import { getPrincipal, isOperator } from "@/lib/access";
import { DemoBanner } from "@/components/demo-banner";
import { LogoutButton } from "@/components/logout-button";
import { SheetTabs, type SheetTabItem } from "@/components/sheet-tabs";

const TABS: SheetTabItem[] = [
  { href: "/home", label: "課題" },
  { href: "/history", label: "成績・履歴" },
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
      <main className="iplus-main flex-1" style={{ maxWidth: 760 }}>
        {children}
      </main>

      <div className="sheet-tabbar" role="navigation" aria-label="メニュー">
        <Link href="/home" className="sheet-brand" aria-label="まなび教室">
          <span className="brand-mark">ま</span>
          <strong>まなび教室</strong>
        </Link>
        <SheetTabs items={TABS} />
        <div className="sheet-status">
          <span className="db-badge" title={p.role === "parent" ? "保護者" : "生徒"}>
            {p.name}
          </span>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
