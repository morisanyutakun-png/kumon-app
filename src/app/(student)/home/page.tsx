import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { encourageMessage, levelInfo, studyStreak } from "@/lib/encourage";
import { listMaterialProgress, type MaterialProgressRow } from "@/lib/material-progress";
import { listGradingHistory, listNotifications, listSubmissions } from "@/lib/queries";
import { GradeReport } from "@/components/grade-report";
import { Mascot } from "@/components/mascot";
import { IconCalendar, IconCheck, IconFlame, IconMedal, IconRedo, IconStar } from "@/components/icons";

function progressBadge(p: MaterialProgressRow, sec: boolean): string {
  switch (p.state) {
    case "complete": return sec ? "教材終了" : "ぜんぶ合格";
    case "resubmit": return sec ? "再提出あり" : "もう一度";
    case "waiting": return sec ? "採点待ち" : "先生まち";
    case "todo": return sec ? "実施中" : "チャレンジ";
    case "returned": return sec ? "返却済み" : "へんきゃく";
    default: return sec ? "準備中" : "じゅんび";
  }
}

function progressLine(p: MaterialProgressRow, sec: boolean): string {
  if (p.isComplete) return sec ? "全範囲が合格済みです。" : "ぜんぶ合格したよ。";
  const range = p.currentRangeText ? `: ${p.currentRangeText}` : "";
  if (p.state === "resubmit") return `${sec ? "再提出" : "もう一度"}${range}`;
  if (p.state === "waiting") return `${sec ? "採点待ち" : "先生まち"}${range}`;
  if (p.state === "todo") return `${sec ? "次" : "つぎ"}${range}`;
  return sec ? "次の案内をお待ちください。" : "つぎの案内をまってね。";
}

function MaterialProgressCards({ rows, sec }: { rows: MaterialProgressRow[]; sec: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="lp-section">
      <div className="lsection">
        {sec ? "教材別の現在地" : "きょうざいの すすみぐあい"}
        <span className="lsection-n">{rows.length}</span>
      </div>
      <div className="mat-progress-grid">
        {rows.map((p) => {
          const total = p.totalCount;
          const pct = total && total > 0 ? Math.min(100, Math.round((p.passedCount / total) * 100)) : 0;
          return (
            <div key={p.assignmentId} className="mat-progress-card">
              <div className="mat-progress-head">
                <span className="mat-progress-subject">{p.subject || "教材"}</span>
                <span className={`mat-progress-badge ${p.state}`}>{progressBadge(p, sec)}</span>
              </div>
              <div className="mat-progress-title">{p.materialName}</div>
              <div className="mat-progress-line">{progressLine(p, sec)}</div>
              <div className="mat-progress-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="mat-progress-foot">
                <span>{total ? `合格 ${p.passedCount} / 全${total}` : `合格 ${p.passedCount}`}</span>
                {p.waitingCount > 0 && <span>{sec ? `採点待ち ${p.waitingCount}` : `先生まち ${p.waitingCount}`}</span>}
                {p.resubmitCount > 0 && <span>{sec ? `再提出 ${p.resubmitCount}` : `もう一度 ${p.resubmitCount}`}</span>}
                {p.isComplete && <span>{sec ? "教材終了" : "ぜんぶ合格"}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionIcon({ kind }: { kind: "tasks" | "self" | "returned" | "grades" }) {
  switch (kind) {
    case "tasks": return <IconCheck size={22} />;
    case "self": return <IconStar size={22} />;
    case "returned": return <IconRedo size={22} />;
    case "grades": return <IconMedal size={22} />;
  }
}

function ActionCard({
  href,
  label,
  value,
  tone,
  kind,
}: {
  href: string;
  label: string;
  value: string;
  tone: string;
  kind: "tasks" | "self" | "returned" | "grades";
}) {
  return (
    <Link href={href} className={`lp-action-card ${tone}`}>
      <span className="lp-action-icon"><ActionIcon kind={kind} /></span>
      <span className="lp-action-main">
        <span className="lp-action-label">{label}</span>
        <span className="lp-action-value">{value}</span>
      </span>
      <span className="lp-action-arrow">→</span>
    </Link>
  );
}

export default async function StudentHome() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const [rows, notices, history, progressRows] = await Promise.all([
    listSubmissions(p.organizationId, { studentIds: idList }),
    listNotifications(p.organizationId, idList, { unreadOnly: true }),
    listGradingHistory(p.organizationId, { studentIds: idList }),
    listMaterialProgress(p.organizationId, { studentIds: idList }),
  ]);

  const actionable = rows.filter((r) => r.status === "not_submitted" || r.status === "resubmit_required");
  const selfGrade = rows.filter((r) => r.status === "submitted" || r.status === "grading");
  const returned = rows.filter((r) => r.status === "returned" || r.status === "resubmit_required");
  const doneCount = rows.filter((r) => r.status === "done").length;
  const pass = history.filter((h) => h.result === "ok").length;
  const lv = levelInfo(pass);
  const streak = studyStreak(rows.map((r) => r.submittedAt).filter((d): d is Date => !!d));
  // Server Component: request-time dashboard metrics.
  // eslint-disable-next-line react-hooks/purity
  const weekAgo = Date.now() - 7 * 86400000;
  const weekCount = rows.filter((r) => r.submittedAt && new Date(r.submittedAt).getTime() >= weekAgo).length;

  let message = "学習状況と返却結果をまとめて確認できます。";
  let grade = "";
  if (p.role === "student" && p.studentId) {
    const [s] = await db.select({ grade: students.grade }).from(students).where(eq(students.id, p.studentId)).limit(1);
    grade = s?.grade ?? "";
    message = encourageMessage(grade);
  }
  const sec = divisionForGrade(grade) === "secondary";
  const greet = p.role === "student"
    ? sec ? `こんにちは、${p.name} さん` : `こんにちは、${p.name} さん！`
    : "こんにちは！";

  return (
    <div>
      <div className="learn-hero lp-hero">
        <div className="learn-hero-body">
          <h1 className="learn-hero-title">{greet}</h1>
          <div className="learn-hero-sub">{message}</div>
          <div className="hero-chips">
            <span className="hero-chip"><IconFlame size={15} /> {streak}日{sec ? "連続" : "れんぞく"}</span>
            <span className="hero-chip"><IconStar size={15} /> {sec ? `合格 ${pass}` : `はなまる ${pass}こ`}</span>
            <span className="hero-chip"><IconMedal size={15} /> {lv.name}</span>
          </div>
        </div>
        {!sec && <span className="learn-hero-mascot" aria-hidden><Mascot className="learn-mascot" /></span>}
      </div>

      {notices.length > 0 && (
        <div className="notice-list">
          {notices.map((n) => (
            <Link key={n.id} href={n.submissionId ? `/submissions/${n.submissionId}` : "/home"} className="notice">
              <span className="notice-ico">{n.type === "resubmit" ? <IconRedo size={18} /> : <IconCheck size={18} />}</span>
              <span style={{ minWidth: 0 }}>
                <span className="notice-title">{n.title}</span>
                <span className="notice-body">{n.studentName}{n.body ? ` ・ ${n.body}` : ""}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="lp-action-grid">
        <ActionCard
          href="/tasks"
          label={sec ? "課題" : "かだい"}
          value={`${actionable.length}`}
          tone="tone-task"
          kind="tasks"
        />
        <ActionCard
          href="/self-grade"
          label={sec ? "自己採点" : "こたえあわせ"}
          value={`${selfGrade.length}`}
          tone="tone-self"
          kind="self"
        />
        <ActionCard
          href="/returned"
          label={sec ? "返却" : "へんきゃく"}
          value={`${returned.length}`}
          tone="tone-returned"
          kind="returned"
        />
        <ActionCard
          href="/history"
          label={sec ? "成績" : "せいせき"}
          value={`${doneCount}`}
          tone="tone-grades"
          kind="grades"
        />
      </div>

      <div className="meter lp-meter">
        <div className="meter-head">
          <span className="meter-title">{sec ? "学習状況" : "がんばりメーター"}</span>
          <span className="meter-level"><IconMedal size={15} /> {lv.name}</span>
        </div>
        <div className="meter-bar"><div className="meter-fill" style={{ width: `${lv.progress}%` }} /></div>
        <div className="meter-foot">
          {lv.isMax
            ? sec ? "最高ランクに到達しました。" : "さいこう称号に とうたつ！"
            : sec ? `次のランクまで あと ${lv.remaining}` : `つぎの称号まで あと ${lv.remaining} こ`}
        </div>
        <div className="meter-stats">
          <div className="ms ms-star"><span className="ms-ico"><IconStar size={20} /></span><b>{pass}</b><span>{sec ? "合格" : "はなまる"}</span></div>
          <div className="ms ms-done"><span className="ms-ico"><IconCheck size={20} /></span><b>{doneCount}</b><span>{sec ? "完了" : "かんりょう"}</span></div>
          <div className="ms ms-week"><span className="ms-ico"><IconCalendar size={20} /></span><b>{weekCount}</b><span>今週の提出</span></div>
        </div>
      </div>

      <section className="lp-section">
        <div className="lsection">
          {sec ? "成績サマリー" : "せいせきサマリー"}
          <Link href="/history" className="db-badge">{sec ? "詳しく見る" : "くわしく見る"}</Link>
        </div>
        <GradeReport rows={history} showStudentName={p.role === "parent"} secondary={sec} />
      </section>

      <MaterialProgressCards rows={progressRows} sec={sec} />
    </div>
  );
}
