import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, getPrincipal, isOperator } from "@/lib/access";
import { divisionForGrade, DIVISION_LABEL, type Division } from "@/lib/division";
import { listSubmissions } from "@/lib/queries";
import { DemoBanner } from "@/components/demo-banner";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { NavTabs, type NavTabItem } from "@/components/nav-tabs";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (isOperator(p)) redirect("/grading");

  // 生徒本人なら学年から部門(小学部/中高部)を判定。中高部はブランド・テーマを切替。
  let division: Division = "elementary";
  if (p.role === "student" && p.studentId) {
    const [s] = await db
      .select({ grade: students.grade })
      .from(students)
      .where(eq(students.id, p.studentId))
      .limit(1);
    division = divisionForGrade(s?.grade);
  }
  const brandLabel = division === "secondary" ? "ノビット 中高部" : "ノビットスタディ";

  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const subRows = await listSubmissions(p.organizationId, { studentIds: idList });
  const taskCount = subRows.filter(
    (r) =>
      r.status === "not_submitted" ||
      r.status === "resubmit_required",
  ).length;
  const selfGradeCount = subRows.filter(
    (r) => r.status === "submitted" || r.status === "grading",
  ).length;
  const returnCount = subRows.filter(
    (r) => r.status === "returned" || r.status === "resubmit_required",
  ).length;

  const tabs: NavTabItem[] = [
    { href: "/home", label: "学習状況", exact: true },
    { href: "/tasks", label: "課題", badge: taskCount },
    { href: "/self-grade", label: "自己採点", badge: selfGradeCount },
    { href: "/returned", label: "返却", badge: returnCount },
  ];

  return (
    <div className="flex flex-1 flex-col" data-division={division}>
      <DemoBanner />
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/home" className="brand" aria-label={brandLabel}>
            <Brand division={division} className="brand-logo" />
          </Link>
          <NavTabs items={tabs} />
          <div className="appbar-right">
            <span className="appbar-user">
              {p.name}
              <span className="appbar-role">
                {p.role === "parent"
                  ? "保護者"
                  : `生徒・${DIVISION_LABEL[division]}`}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="iplus-main narrow flex-1">{children}</main>
    </div>
  );
}
