"use client";

import { useState } from "react";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import type { SubmissionRow } from "@/lib/queries";
import type { SubmissionStatus } from "@/db/schema";

function ctaLabel(status: SubmissionStatus, sec: boolean): string | undefined {
  switch (status) {
    case "not_submitted": return sec ? "提出する" : "ていしゅつする";
    case "resubmit_required": return sec ? "再提出する" : "もう一度ていしゅつ";
    case "submitted": case "grading": return sec ? "答え合わせ" : "こたえあわせ";
    case "returned": return sec ? "結果を見る" : "けっかを見る";
    default: return undefined;
  }
}

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

function fmtDue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function TaskCard({ r, sec }: { r: SubmissionRow; sec: boolean }) {
  const cta = ctaLabel(r.status, sec);
  const color = subjectColor(r.subject);
  return (
    <Link href={`/submissions/${r.submissionId}`} className="task">
      <span className="task-ico" style={{ background: color }}>{(r.subject || "課")[0]}</span>
      <div className="task-main">
        <div className="task-title">{r.assignmentTitle || r.materialName}<StatusBadge status={r.status} /></div>
        <div className="task-meta">
          {r.subject}
          {r.rangeText ? ` ・ ${r.rangeText}` : ""}
          {r.dueDate ? ` ・ ${sec ? "期限" : "きげん"} ${fmtDue(r.dueDate)}` : ""}
        </div>
      </div>
      {cta && <span className="task-cta" style={{ background: color }}>{cta}</span>}
    </Link>
  );
}

function List({ rows, sec }: { rows: SubmissionRow[]; sec: boolean }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((r) => <TaskCard key={r.submissionId} r={r} sec={sec} />)}
    </div>
  );
}

export function HomeTabs({
  todo,
  waiting,
  returned,
  sec,
}: {
  todo: SubmissionRow[];
  waiting: SubmissionRow[];
  returned: SubmissionRow[];
  sec: boolean;
}) {
  const todoCount = todo.length;
  // 返却タブ: 採点待ち(自己採点できる) + 返却済み(未確認) の合計を「溜まっている件数」とする。
  const returnCount = waiting.length + returned.length;

  // 初期表示: やる課題があれば課題タブ、無ければ返却タブ。
  const [tab, setTab] = useState<"todo" | "returned">(
    todoCount === 0 && returnCount > 0 ? "returned" : "todo",
  );

  return (
    <section style={{ marginTop: 8 }}>
      <div className="home-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "todo"}
          className={`home-tab${tab === "todo" ? " on" : ""}`}
          onClick={() => setTab("todo")}
        >
          {sec ? "課題" : "やること"}
          {todoCount > 0 && <span className="home-tab-badge">{todoCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "returned"}
          className={`home-tab${tab === "returned" ? " on" : ""}`}
          onClick={() => setTab("returned")}
        >
          {sec ? "返却・答え合わせ" : "へんきゃく・こたえあわせ"}
          {returnCount > 0 && <span className="home-tab-badge alt">{returnCount}</span>}
        </button>
      </div>

      {tab === "todo" ? (
        todoCount > 0 ? (
          <List rows={todo} sec={sec} />
        ) : (
          <div className="empty">{sec ? "取り組む課題はありません。" : "いまやる課題はないよ。"}</div>
        )
      ) : returnCount > 0 ? (
        <div style={{ display: "grid", gap: 18 }}>
          {waiting.length > 0 && (
            <div>
              <div className="lsection">
                {sec ? "採点待ち・自己採点できます" : "こたえあわせできるよ"}
                <span className="lsection-n">{waiting.length}</span>
              </div>
              <List rows={waiting} sec={sec} />
            </div>
          )}
          {returned.length > 0 && (
            <div>
              <div className="lsection">
                {sec ? "先生から返却" : "せんせいから へんきゃく"}
                <span className="lsection-n">{returned.length}</span>
              </div>
              <List rows={returned} sec={sec} />
            </div>
          )}
        </div>
      ) : (
        <div className="empty">{sec ? "返却された課題はまだありません。" : "まだ へんきゃくは ないよ。"}</div>
      )}
    </section>
  );
}
