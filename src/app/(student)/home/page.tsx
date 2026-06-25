import Link from "next/link";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { students } from "@/db/schema";
import { accessibleStudentIds, requirePrincipal } from "@/lib/access";
import { divisionForGrade } from "@/lib/division";
import { encourageMessage, levelInfo, studyStreak } from "@/lib/encourage";
import { listGradingHistory, listNotifications, listSubmissions } from "@/lib/queries";
import { Mascot } from "@/components/mascot";
import { IconCalendar, IconCheck, IconFlame, IconMedal, IconRedo, IconStar } from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import type { SubmissionStatus } from "@/db/schema";

const CTA: Partial<Record<SubmissionStatus, string>> = {
  not_submitted: "ていしゅつする",
  resubmit_required: "もう一度ていしゅつ",
  returned: "けっかを見る",
};

function subjectColor(subject: string): string {
  switch (subject) {
    case "算数": return "#1aa3e6";
    case "国語": return "#ff5d8f";
    case "理科": return "#18c39a";
    case "社会": return "#ff8a3d";
    case "英語": return "#7c5cfc";
    case "プログラミング": return "#13b6c9";
    default: return "#1c9dd8";
  }
}
function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function TaskCard({ r }: { r: SubmissionRow }) {
  const cta = CTA[r.status];
  const color = subjectColor(r.subject);
  return (
    <Link href={`/submissions/${r.submissionId}`} className="task">
      <span className="task-ico" style={{ background: color }}>{(r.subject || "課")[0]}</span>
      <div className="task-main">
        <div className="task-title">{r.assignmentTitle || r.materialName}<StatusBadge status={r.status} /></div>
        <div className="task-meta">{r.subject}{r.rangeText ? ` ・ ${r.rangeText}` : ""}{r.dueDate ? ` ・ きげん ${fmtDue(r.dueDate)}` : ""}</div>
      </div>
      {cta && <span className="task-cta" style={{ background: color }}>{cta}</span>}
    </Link>
  );
}

function Section({ title, rows }: { title: string; rows: SubmissionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginBottom: 22 }}>
      <div className="lsection">{title}<span className="lsection-n">{rows.length}</span></div>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => <TaskCard key={r.submissionId} r={r} />)}
      </div>
    </section>
  );
}

export default async function StudentHome() {
  const p = await requirePrincipal();
  const ids = await accessibleStudentIds(p);
  const idList = ids === "*" ? [] : ids;
  const [rows, notices, history] = await Promise.all([
    listSubmissions(p.organizationId, { studentIds: idList }),
    listNotifications(p.organizationId, idList, { unreadOnly: true }),
    listGradingHistory(p.organizationId, { studentIds: idList }),
  ]);

  const todo = rows.filter((r) => r.status === "not_submitted" || r.status === "resubmit_required");
  const waiting = rows.filter((r) => r.status === "submitted" || r.status === "grading");
  const returned = rows.filter((r) => r.status === "returned");
  const doneCount = rows.filter((r) => r.status === "done").length;
  const pass = history.filter((h) => h.result === "ok").length;
  const lv = levelInfo(pass);
  const streak = studyStreak(rows.map((r) => r.submittedAt).filter((d): d is Date => !!d));
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
            <span className="hero-chip"><IconFlame size={15} /> {streak}日れんぞく</span>
            <span className="hero-chip"><IconStar size={15} /> はなまる {pass}こ</span>
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
          <span className="mission-cta" style={{ background: missionColor }}>はじめる →</span>
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
          <span className="meter-title">がんばりメーター</span>
          <span className="meter-level"><IconMedal size={15} /> {lv.name}</span>
        </div>
        <div className="meter-bar"><div className="meter-fill" style={{ width: `${lv.progress}%` }} /></div>
        <div className="meter-foot">
          {lv.isMax ? "さいこう称号に とうたつ！すごい！" : `つぎの称号まで あと ${lv.remaining} こ`}
        </div>
        <div className="meter-stats">
          <div className="ms ms-star"><span className="ms-ico"><IconStar size={20} /></span><b>{pass}</b><span>はなまる</span></div>
          <div className="ms ms-done"><span className="ms-ico"><IconCheck size={20} /></span><b>{doneCount}</b><span>かんりょう</span></div>
          <div className="ms ms-week"><span className="ms-ico"><IconCalendar size={20} /></span><b>{weekCount}</b><span>今週の提出</span></div>
        </div>
      </div>

      <Section title="やること" rows={todo} />
      <Section title="けっかまち" rows={waiting} />
      <Section title="へんきゃく・かくにん" rows={returned} />
    </div>
  );
}
