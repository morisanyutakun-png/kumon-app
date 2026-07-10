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

function ActionIcon({ kind }: { kind: "tasks" | "self" | "returned" }) {
  switch (kind) {
    case "tasks": return <IconCheck size={22} />;
    case "self": return <IconStar size={22} />;
    case "returned": return <IconRedo size={22} />;
  }
}

function ActionCard({
  href,
  label,
  hint,
  value,
  cta,
  tone,
  kind,
}: {
  href: string;
  label: string;
  hint: string;
  value: string;
  cta: string;
  tone: string;
  kind: "tasks" | "self" | "returned";
}) {
  return (
    <Link href={href} className={`lp-action-card ${tone}`}>
      <span className="lp-action-icon"><ActionIcon kind={kind} /></span>
      <span className="lp-action-main">
        <span className="lp-action-copy">
          <span className="lp-action-label">{label}</span>
          <span className="lp-action-hint">{hint}</span>
        </span>
        <span className="lp-action-side">
          <span className="lp-action-value">{value}</span>
          <span className="lp-action-cta">{cta}</span>
        </span>
      </span>
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
  const primaryHref = actionable.length > 0 ? "/tasks" : selfGrade.length > 0 ? "/self-grade" : returned.length > 0 ? "/returned" : "/tasks";
  const primaryLabel = actionable.length > 0
    ? sec ? "今日の課題に取り組む" : "きょうの課題をやる"
    : selfGrade.length > 0
      ? sec ? "答え合わせへ進む" : "こたえあわせへ"
      : returned.length > 0
        ? sec ? "返却を確認する" : "へんきゃくを見る"
        : sec ? "課題を確認する" : "かだいを見る";
  const focusLead = actionable.length > 0
    ? sec ? "未提出の課題が" : "まだのかだいが "
    : selfGrade.length > 0
      ? sec ? "自己採点が" : "こたえあわせが "
      : returned.length > 0
        ? sec ? "返却が" : "へんきゃくが "
        : "";
  const focusCount = actionable.length > 0
    ? sec ? `${actionable.length}件` : `${actionable.length}こ`
    : selfGrade.length > 0
      ? sec ? `${selfGrade.length}件` : `${selfGrade.length}こ`
      : returned.length > 0
        ? sec ? `${returned.length}件` : `${returned.length}こ`
        : "";
  const focusTail = actionable.length > 0
    ? sec ? "あります" : "あるよ"
    : selfGrade.length > 0
      ? sec ? "あります" : "あるよ"
      : returned.length > 0
        ? sec ? "届いています" : "きているよ"
        : sec ? "今できる課題はありません" : "いまできる かだいはないよ";
  const focusHint = actionable.length > 0
    ? sec ? "まずは答案を保存して提出へ。" : "まずは とりくんで 出そう。"
    : selfGrade.length > 0
      ? sec ? "提出済みの範囲を答え合わせ。" : "出したら すぐこたえあわせ。"
      : returned.length > 0
        ? sec ? "先生の添削を確認しましょう。" : "先生からの へんきゃくを見よう。"
        : sec ? "新しい課題が届いたらここに表示されます。" : "あたらしいかだいは ここに出るよ。";

  return (
    <div className="student-home">
      <div className="learn-hero lp-hero">
        <div className="learn-hero-body">
          <div className="learn-hero-kicker">{sec ? "Learning Dashboard" : "きょうのホーム"}</div>
          <h1 className="learn-hero-title">{greet}</h1>
          <div className="learn-hero-sub">{message}</div>
          <div className="hero-chips">
            <span className="hero-chip"><IconFlame size={15} /> {streak}日{sec ? "連続" : "れんぞく"}</span>
            <span className="hero-chip"><IconStar size={15} /> {sec ? `合格 ${pass}` : `はなまる ${pass}こ`}</span>
            <span className="hero-chip"><IconMedal size={15} /> {lv.name}</span>
          </div>
          <Link href={primaryHref} className="hero-primary-cta">{primaryLabel}</Link>
        </div>
        {sec ? (
          <div className="hero-command" aria-label="今日の一歩">
            <div className="hero-command-top">
              <span className="hero-command-eyebrow">Today&apos;s Focus</span>
              <span className="hero-command-pulse" aria-hidden />
            </div>
            <div className="hero-command-focus">
              <span className="hero-command-focus-label">
                {focusLead}
                {focusCount && <strong className="hero-command-focus-count">{focusCount}</strong>}
                {focusTail}
              </span>
              <span className="hero-command-focus-hint">{focusHint}</span>
            </div>
          </div>
        ) : (
          <span className="learn-hero-mascot" aria-hidden><Mascot className="learn-mascot" /></span>
        )}
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

      <div className="lp-section-head">
        <div>
          <span className="lp-section-kicker">{sec ? "Next Actions" : "つぎにやること"}</span>
          <h2>{sec ? "今日の学習" : "きょうの学習"}</h2>
        </div>
        <span className="lp-flow-mini">{sec ? "提出 → 自己採点 → 返却" : "出す → こたえあわせ → へんきゃく"}</span>
      </div>

      <div className="lp-action-grid">
        <ActionCard
          href="/tasks"
          label={sec ? "課題" : "かだい"}
          hint={sec ? "未提出" : "できるもの"}
          value={`${actionable.length}`}
          cta={sec ? "取り組む" : "とりくむ"}
          tone="tone-task"
          kind="tasks"
        />
        <ActionCard
          href="/self-grade"
          label={sec ? "自己採点" : "こたえあわせ"}
          hint={sec ? "即確認" : "すぐ見る"}
          value={`${selfGrade.length}`}
          cta={sec ? "答え合わせ" : "見る"}
          tone="tone-self"
          kind="self"
        />
        <ActionCard
          href="/returned"
          label={sec ? "返却" : "へんきゃく"}
          hint={sec ? "添削" : "先生から"}
          value={`${returned.length}`}
          cta={sec ? "確認" : "見る"}
          tone="tone-returned"
          kind="returned"
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

      <section className="lp-section lp-report-section">
        <div className="lsection">
          {sec ? "学習レポート" : "がんばりレポート"}
        </div>
        <GradeReport rows={history} showStudentName={p.role === "parent"} secondary={sec} />
      </section>

      <MaterialProgressCards rows={progressRows} sec={sec} />
    </div>
  );
}
