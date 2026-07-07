import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { encourageMessage, levelInfo, studyStreak } from "@/lib/encourage";
import { listMaterialProgress, type MaterialProgressRow } from "@/lib/material-progress";
import { listGradingHistory, listNotifications, listSubmissions } from "@/lib/queries";
import { Mascot } from "@/components/mascot";
import { IconCalendar, IconCheck, IconFlame, IconMedal, IconRedo, IconStar } from "@/components/icons";
import { TaskList } from "@/components/task-card";

function subjectColor(subject: string): string {
  switch (subject) {
    case "算数": case "数学": return "#1aa3e6";
    case "国語": return "#ff5d8f";
    case "理科": case "物理": return "#18c39a";
    case "化学": return "#00a3a3";
    case "生物": return "#3bb54a";
    case "社会": case "地歴公民": return "#ff8a3d";
    case "英語": return "#7c5cfc";
    case "情報": case "プログラミング": return "#13b6c9";
    default: return "#1c9dd8";
  }
}

function todoRank(status: string): number {
  if (status === "resubmit_required") return 0;
  if (status === "not_submitted") return 1;
  return 2;
}

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
    <section style={{ marginBottom: 24 }}>
      <div className="lsection">
        {sec ? "教材の進み具合" : "きょうざいの すすみぐあい"}
        <span className="lsection-n">{rows.length}</span>
      </div>
      <div className="mat-progress-grid">
        {rows.map((p) => {
          const total = p.totalCount;
          const pct = total && total > 0 ? Math.min(100, Math.round((p.passedCount / total) * 100)) : 0;
          const href = p.currentSubmissionId
            ? `/submissions/${p.currentSubmissionId}`
            : p.isComplete
              ? `/api/files/material-complete/${p.assignmentId}?dl=1`
              : null;
          const body = (
            <>
              <div className="mat-progress-head">
                <span className="mat-progress-subject">{p.subject || "教材"}</span>
                <span className={`mat-progress-badge ${p.state}`}>{progressBadge(p, sec)}</span>
              </div>
              <div className="mat-progress-title">{p.materialName}</div>
              <div className="mat-progress-line">{progressLine(p, sec)}</div>
              <div className="mat-progress-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="mat-progress-foot">
                <span>{total ? `合格 ${p.passedCount} / 全${total}` : `合格 ${p.passedCount}`}</span>
                {p.isComplete && <span>{sec ? "一冊分PDF" : "ぜんぶPDF"}</span>}
                {p.waitingCount > 0 && <span>{sec ? `採点待ち ${p.waitingCount}` : `先生まち ${p.waitingCount}`}</span>}
                {p.resubmitCount > 0 && <span>{sec ? `再提出 ${p.resubmitCount}` : `もう一度 ${p.resubmitCount}`}</span>}
              </div>
            </>
          );
          if (p.isComplete) {
            return (
              <a key={p.assignmentId} href={`/api/files/material-complete/${p.assignmentId}?dl=1`} className="mat-progress-card">
                {body}
              </a>
            );
          }
          return href ? (
            <Link key={p.assignmentId} href={href} className="mat-progress-card">
              {body}
            </Link>
          ) : (
            <div key={p.assignmentId} className="mat-progress-card">
              {body}
            </div>
          );
        })}
      </div>
    </section>
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

  const todo = rows
    .filter((r) => r.status === "not_submitted" || r.status === "resubmit_required")
    .sort((a, b) => todoRank(a.status) - todoRank(b.status) || b.updatedAt.getTime() - a.updatedAt.getTime());
  const doneCount = rows.filter((r) => r.status === "done").length;
  const pass = history.filter((h) => h.result === "ok").length;
  const lv = levelInfo(pass);
  const streak = studyStreak(rows.map((r) => r.submittedAt).filter((d): d is Date => !!d));
  // Server Component: request-time dashboard metrics.
  // eslint-disable-next-line react-hooks/purity
  const weekAgo = Date.now() - 7 * 86400000;
  const weekCount = rows.filter((r) => r.submittedAt && new Date(r.submittedAt).getTime() >= weekAgo).length;

  let message = "お子さまの今日の課題と結果を確認できます。";
  let grade = "";
  if (p.role === "student" && p.studentId) {
    const [s] = await db.select({ grade: students.grade }).from(students).where(eq(students.id, p.studentId)).limit(1);
    grade = s?.grade ?? "";
    message = encourageMessage(grade);
  }
  // 部門 (中高部は落ち着いたトーン・マスコット非表示)。
  const sec = divisionForGrade(grade) === "secondary";
  const greet = p.role === "student"
    ? sec ? `こんにちは、${p.name} さん` : `こんにちは、${p.name} さん！`
    : "こんにちは！";

  const mission = todo[0];
  const missionColor = mission ? subjectColor(mission.subject) : "#1c9dd8";

  return (
    <div>
      {/* ヒーロー: キャラ + メッセージ + がんばり状況 */}
      <div className="learn-hero">
        <div className="learn-hero-body">
          <div className="learn-hero-title">{greet}</div>
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

      {/* 今日のミッション */}
      {mission ? (
        <Link href={`/submissions/${mission.submissionId}`} className="mission" style={{ ["--accent" as string]: missionColor }}>
          {!sec && <span className="mission-mascot"><Mascot pose="point" sizes="90px" /></span>}
          <div className="mission-body">
            <div className="mission-label">{sec ? "今日の課題" : "きょうのミッション"}</div>
            <div className="mission-title">{mission.assignmentTitle || mission.materialName}</div>
            <div className="mission-meta">{mission.subject}{mission.rangeText ? ` ・ ${mission.rangeText}` : ""}</div>
          </div>
          <span className="mission-cta" style={{ background: missionColor }}>{sec ? "取り組む →" : "はじめる →"}</span>
        </Link>
      ) : rows.length === 0 ? (
        <div className="mission mission-done">
          {!sec && <span className="mission-mascot"><Mascot pose="point" sizes="90px" /></span>}
          <div className="mission-body">
            <div className="mission-title">{sec ? "準備OK" : "じゅんび オッケー！"}</div>
            <div className="mission-meta">{sec ? "先生からの課題が届くと、ここに表示されます。" : "先生からの課題がとどくと、ここに出るよ。たのしみにまっててね。"}</div>
          </div>
        </div>
      ) : (
        <div className="mission mission-done">
          {!sec && <span className="mission-mascot"><Mascot pose="wave" sizes="90px" /></span>}
          <div className="mission-body">
            <div className="mission-title">{sec ? "本日の課題は完了です" : "きょうのミッション かんりょう！"}</div>
            <div className="mission-meta">{sec ? "お疲れさまでした。新しい課題をお待ちください。" : "よくがんばったね。あたらしい課題をまっててね。"}</div>
          </div>
        </div>
      )}

      {/* がんばりメーター */}
      <div className="meter">
        <div className="meter-head">
          <span className="meter-title">{sec ? "学習状況" : "がんばりメーター"}</span>
          <span className="meter-level"><IconMedal size={15} /> {lv.name}</span>
        </div>
        <div className="meter-bar"><div className="meter-fill" style={{ width: `${lv.progress}%` }} /></div>
        <div className="meter-foot">
          {lv.isMax
            ? sec ? "最高ランクに到達しました。" : "さいこう称号に とうたつ！すごい！"
            : sec ? `次のランクまで あと ${lv.remaining}` : `つぎの称号まで あと ${lv.remaining} こ`}
        </div>
        <div className="meter-stats">
          <div className="ms ms-star"><span className="ms-ico"><IconStar size={20} /></span><b>{pass}</b><span>{sec ? "合格" : "はなまる"}</span></div>
          <div className="ms ms-done"><span className="ms-ico"><IconCheck size={20} /></span><b>{doneCount}</b><span>{sec ? "完了" : "かんりょう"}</span></div>
          <div className="ms ms-week"><span className="ms-ico"><IconCalendar size={20} /></span><b>{weekCount}</b><span>今週の提出</span></div>
        </div>
      </div>

      <MaterialProgressCards rows={progressRows} sec={sec} />

      {/* 課題(やること)。今日のミッションで先頭を大きく出しているので、残りをここに一覧。 */}
      {todo.length > 1 && (
        <section style={{ marginTop: 8 }}>
          <div className="lsection">
            {sec ? "ほかの課題" : "ほかの やること"}
            <span className="lsection-n">{todo.length - 1}</span>
          </div>
          <TaskList rows={todo.slice(1)} sec={sec} />
        </section>
      )}
    </div>
  );
}
