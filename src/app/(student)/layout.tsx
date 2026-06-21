import { redirect } from "next/navigation";
import Link from "next/link";

import { getPrincipal, isOperator } from "@/lib/access";
import { DemoBanner } from "@/components/demo-banner";
import { LogoutButton } from "@/components/logout-button";

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
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/home" className="text-lg font-bold">
              まなび教室
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link href="/home" className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">
                課題
              </Link>
              <Link href="/history" className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">
                履歴
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>
              {p.name}
              <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {p.role === "parent" ? "保護者" : "生徒"}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
