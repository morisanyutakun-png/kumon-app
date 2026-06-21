import { requireOperator } from "@/lib/access";
import { LogoutButton } from "@/components/logout-button";
import { NavLink } from "@/components/nav-link";

const LINKS = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/grading", label: "採点" },
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
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">まなび教室 運営</span>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>
                {p.name}
                <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  {p.role === "admin" ? "管理者" : "運営・採点者"}
                </span>
              </span>
              <LogoutButton />
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} />
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
