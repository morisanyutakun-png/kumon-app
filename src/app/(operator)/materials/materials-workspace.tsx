"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addUnit,
  addUnitsBulk,
  deleteMaterial,
  duplicateMaterial,
  insertUnitBefore,
  quickAddMaterial,
  removeMaterialFile,
  removeUnit,
  renameUnit,
  saveMaterialMeta,
  uploadMaterialFile,
} from "@/lib/actions/admin-actions";

// -----------------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------------
export interface WsFile {
  id: string;
  fileName: string;
  unitId: string | null;
}
export interface WsUnit {
  id: string;
  title: string;
}
export interface WsMaterial {
  id: string;
  name: string;
  subject: string;
  progressType: string;
  completionAction: string;
  numberStart: number | null;
  numberEnd: number | null;
  rangeSummary: string;
}
export interface WsSelected {
  id: string;
  name: string;
  subject: string;
  description: string;
  progressType: string;
  completionAction: string;
  numberStart: number | null;
  numberEnd: number | null;
  units: WsUnit[];
  files: WsFile[];
}

const PROGRESS_OPTIONS = [
  { value: "chapter", label: "章" },
  { value: "number", label: "番号" },
  { value: "manual", label: "手入力" },
];
const COMPLETION_OPTIONS = [
  { value: "delete", label: "完了時削除" },
  { value: "review_loop", label: "総復習反復" },
];

/** 教科ごとの左端アクセント色。 */
function subjectAccent(subject: string): string {
  switch (subject) {
    case "英語": return "#ec4899";
    case "数学": case "算数": return "#2563eb";
    case "国語": return "#ef4444";
    case "理科": case "物理": case "化学": case "生物": return "#16a34a";
    case "社会": case "地歴公民": return "#eab308";
    case "情報": case "プログラミング": return "#7c3aed";
    default: return "#94a3b8";
  }
}

const ctrl: React.CSSProperties = {
  height: 34,
  border: "1px solid #cdd4db",
  padding: "0 8px",
  font: "inherit",
  fontSize: 13,
  background: "#fff",
  borderRadius: 6,
};

// -----------------------------------------------------------------------------
// ファイル割り当て欄 (範囲 or 教材全体)
// -----------------------------------------------------------------------------
function FileSlot({
  materialId,
  unitId,
  files,
  onChanged,
  compact = false,
}: {
  materialId: string;
  unitId: string | null;
  files: WsFile[];
  onChanged: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(picked)) fd.append("file", f);
    if (unitId) fd.set("unitId", unitId);
    const count = picked.length;
    startTransition(async () => {
      try {
        await uploadMaterialFile(materialId, fd);
        toast.success(`ファイルを${count}件追加しました。`);
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "アップロードに失敗しました。");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function del(fileId: string, fileName: string) {
    if (!window.confirm(`ファイル「${fileName}」を削除しますか?`)) return;
    startTransition(async () => {
      try {
        await removeMaterialFile(fileId);
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "削除に失敗しました。");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      {files.map((f) => (
        <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <a href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge" style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📎 {f.fileName}
          </a>
          <button type="button" onClick={() => del(f.id, f.fileName)} disabled={pending} title="削除" style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13 }}>×</button>
        </span>
      ))}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple onChange={onPicked} style={{ display: "none" }} />
      <button type="button" className="db-badge" onClick={() => inputRef.current?.click()} disabled={pending} style={{ cursor: "pointer", color: "var(--primary)", borderColor: "var(--primary)" }}>
        {pending ? "…" : files.length > 0 ? "＋" : compact ? "＋PDF" : "＋ PDFを割り当て"}
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 左: 教材リストの1行 (インライン自動保存)
// -----------------------------------------------------------------------------
function MaterialListRow({
  m,
  selected,
  onSelect,
  onChanged,
}: {
  m: WsMaterial;
  selected: boolean;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const [subject, setSubject] = useState(m.subject);
  const [name, setName] = useState(m.name);
  const [progressType, setProgressType] = useState(m.progressType);
  const [completionAction, setCompletionAction] = useState(m.completionAction);
  const [flag, setFlag] = useState<"" | "saving" | "saved">("");
  const [pending, startTransition] = useTransition();

  function save(next?: Partial<{ subject: string; name: string; progressType: string; completionAction: string }>) {
    const payload = {
      name: next?.name ?? name,
      subject: next?.subject ?? subject,
      description: "",
      progressType: next?.progressType ?? progressType,
      completionAction: next?.completionAction ?? completionAction,
      numberStart: m.numberStart,
      numberEnd: m.numberEnd,
    };
    if (!payload.name.trim()) return;
    setFlag("saving");
    startTransition(async () => {
      try {
        await saveMaterialMeta(m.id, payload);
        setFlag("saved");
        setTimeout(() => setFlag(""), 1400);
        onChanged();
      } catch (err) {
        setFlag("");
        toast.error(err instanceof Error ? err.message : "保存に失敗しました。");
      }
    });
  }

  function dup() {
    startTransition(async () => {
      try {
        await duplicateMaterial(m.id);
        toast.success("複製しました。");
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "複製に失敗しました。");
      }
    });
  }

  function del() {
    if (!window.confirm(`教材「${m.name}」と全範囲・割当を削除しますか?`)) return;
    startTransition(async () => {
      try {
        await deleteMaterial(m.id);
        toast.success("削除しました。");
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "削除に失敗しました。");
      }
    });
  }

  return (
    <div
      className="mws-row"
      style={{
        borderLeft: `4px solid ${subjectAccent(subject)}`,
        background: selected ? "#eef6ff" : "#fff",
      }}
    >
      <button type="button" className="mws-open" onClick={onSelect} title="範囲を開く">範囲</button>
      <select value={subject} onChange={(e) => { setSubject(e.target.value); save({ subject: e.target.value }); }} style={{ ...ctrl, width: 84 }} aria-label="教科">
        {SUBJECT_OPTIONS(subject).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ ...ctrl, flex: "1 1 140px", minWidth: 100, fontWeight: 600 }} aria-label="教材名" />
      <select value={progressType} onChange={(e) => { setProgressType(e.target.value); save({ progressType: e.target.value }); }} style={{ ...ctrl, width: 76 }} aria-label="進み方">
        {PROGRESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={completionAction} onChange={(e) => { setCompletionAction(e.target.value); save({ completionAction: e.target.value }); }} style={{ ...ctrl, width: 108 }} aria-label="完了後">
        {COMPLETION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="mws-summary" title={m.rangeSummary}>{m.rangeSummary}</span>
      <span style={{ width: 46, fontSize: 11, color: "#16a34a" }}>{flag === "saving" ? "保存中" : flag === "saved" ? "✓保存" : ""}</span>
      <button type="button" className="db-badge" onClick={dup} disabled={pending} style={{ cursor: "pointer" }}>複製</button>
      <button type="button" className="db-badge" onClick={del} disabled={pending} style={{ cursor: "pointer", color: "#b91c1c", borderColor: "#f0b4b4" }}>削除</button>
    </div>
  );
}

// SUBJECT_OPTIONS は親から渡す代わりに、選択中の教科を必ず含めるためのヘルパ。
let SUBJECTS_GLOBAL: string[] = [];
function SUBJECT_OPTIONS(current: string): string[] {
  const base = SUBJECTS_GLOBAL;
  return current && !base.includes(current) ? [current, ...base] : base;
}

// -----------------------------------------------------------------------------
// 右: 範囲編集の1行
// -----------------------------------------------------------------------------
function RangeRow({
  materialId,
  unit,
  pos,
  files,
  onChanged,
}: {
  materialId: string;
  unit: WsUnit;
  pos: number;
  files: WsFile[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(unit.title);
  const [pending, startTransition] = useTransition();

  function saveTitle() {
    if (title.trim() === unit.title.trim()) return;
    startTransition(async () => {
      try { await renameUnit(unit.id, title); onChanged(); }
      catch (err) { toast.error(err instanceof Error ? err.message : "保存に失敗しました。"); }
    });
  }
  function insertBefore() {
    startTransition(async () => {
      try { await insertUnitBefore(materialId, pos); onChanged(); }
      catch (err) { toast.error(err instanceof Error ? err.message : "挿入に失敗しました。"); }
    });
  }
  function del() {
    if (!window.confirm(`範囲「${unit.title || "(空)"}」を削除しますか?`)) return;
    startTransition(async () => {
      try { await removeUnit(unit.id); onChanged(); }
      catch (err) { toast.error(err instanceof Error ? err.message : "削除に失敗しました。"); }
    });
  }

  return (
    <li className="mws-range">
      <span className="mws-range-num">{pos}</span>
      <div className="mws-range-body">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder="範囲名" style={{ ...ctrl, width: "100%" }} />
        <FileSlot materialId={materialId} unitId={unit.id} files={files} onChanged={onChanged} compact />
      </div>
      <div style={{ display: "flex", gap: 5, flex: "0 0 auto" }}>
        <button type="button" className="db-badge" onClick={insertBefore} disabled={pending} style={{ cursor: "pointer" }} title="この行の前に挿入">↥ 挿入</button>
        <button type="button" className="db-badge" onClick={del} disabled={pending} style={{ cursor: "pointer", color: "#b91c1c", borderColor: "#f0b4b4" }}>削除</button>
      </div>
    </li>
  );
}

// -----------------------------------------------------------------------------
// 右パネル本体
// -----------------------------------------------------------------------------
function RangePanel({ sel, onChanged }: { sel: WsSelected; onChanged: () => void }) {
  const [newRange, setNewRange] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [numStart, setNumStart] = useState(sel.numberStart?.toString() ?? "");
  const [numEnd, setNumEnd] = useState(sel.numberEnd?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const addRef = useRef<HTMLInputElement>(null);

  const materialFiles = sel.files.filter((f) => f.unitId === null);
  const filesByUnit = (uid: string) => sel.files.filter((f) => f.unitId === uid);

  function add() {
    if (!newRange.trim()) { toast.warning("範囲名を入力してください。"); return; }
    startTransition(async () => {
      try { await addUnit(sel.id, newRange); setNewRange(""); addRef.current?.focus(); onChanged(); }
      catch (err) { toast.error(err instanceof Error ? err.message : "追加に失敗しました。"); }
    });
  }
  function bulkAdd() {
    if (!bulkText.trim()) { toast.warning("貼り付けてください。"); return; }
    startTransition(async () => {
      try {
        const res = await addUnitsBulk(sel.id, bulkText);
        toast.success(`${res.added}件の範囲を追加しました。`);
        setBulkText(""); setBulkOpen(false); onChanged();
      } catch (err) { toast.error(err instanceof Error ? err.message : "追加に失敗しました。"); }
    });
  }
  function saveNumber() {
    startTransition(async () => {
      try {
        await saveMaterialMeta(sel.id, {
          name: sel.name, subject: sel.subject, description: sel.description,
          progressType: "number", completionAction: sel.completionAction,
          numberStart: numStart ? Number(numStart) : null,
          numberEnd: numEnd ? Number(numEnd) : null,
        });
        toast.success("番号範囲を保存しました。"); onChanged();
      } catch (err) { toast.error(err instanceof Error ? err.message : "保存に失敗しました。"); }
    });
  }

  const completionLabel = COMPLETION_OPTIONS.find((o) => o.value === sel.completionAction)?.label ?? "";

  return (
    <div>
      <div className="mws-panel-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>範囲編集</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.85 }}>{sel.name}</p>
        </div>
        <span className="metric-chip" style={{ background: "rgba(255,255,255,.2)", color: "#fff", borderColor: "transparent" }}>
          {sel.progressType === "chapter" ? `${sel.units.length} 範囲` : sel.progressType === "number" ? "番号" : "手入力"}
        </span>
      </div>

      <div className="mws-panel-body">
        <div className="mws-detail-summary">
          <span className="badge" style={{ background: subjectAccent(sel.subject), color: "#fff", border: "none" }}>{sel.subject || "教科未設定"}</span>
          <strong>{sel.name}</strong>
          <span className="muted" style={{ fontSize: 12 }}>{completionLabel}</span>
        </div>

        {/* 教材全体ファイル */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#5b6470", marginBottom: 6 }}>教材全体のファイル（全範囲で表示）</div>
          <FileSlot materialId={sel.id} unitId={null} files={materialFiles} onChanged={onChanged} />
        </div>

        {sel.progressType === "manual" ? (
          <p className="empty" style={{ fontSize: 13 }}>手入力教材のため範囲登録は不要です。左の「進み方」を「章」に変えると範囲を並べられます。</p>
        ) : sel.progressType === "number" ? (
          <div>
            <p style={{ fontSize: 13, color: "#5b6470", marginBottom: 8 }}>番号教材は開始〜終了番号とペースで自動的に進みます。</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span>No.</span>
              <input type="number" min={1} value={numStart} onChange={(e) => setNumStart(e.target.value)} placeholder="開始" style={{ ...ctrl, width: 90 }} />
              <span>-</span>
              <input type="number" min={1} value={numEnd} onChange={(e) => setNumEnd(e.target.value)} placeholder="終了" style={{ ...ctrl, width: 90 }} />
              <button type="button" className="btn-primary" onClick={saveNumber} disabled={pending}>保存</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input ref={addRef} value={newRange} onChange={(e) => setNewRange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="範囲を末尾に追加" style={{ ...ctrl, flex: 1, height: 38 }} />
              <button type="button" className="btn-primary" onClick={add} disabled={pending}>＋ 末尾に追加</button>
            </div>

            <button type="button" className="db-badge" onClick={() => setBulkOpen((v) => !v)} style={{ cursor: "pointer", marginBottom: 8 }}>
              📋 単元を一括追加（1行1範囲・CSV/Excel貼り付け）
            </button>
            {bulkOpen && (
              <div style={{ marginBottom: 10 }}>
                <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} placeholder={"テーマ1 生命の起源\nテーマ2 遺伝の変化\n…（1行ごとに範囲）"} style={{ width: "100%", border: "1px solid #cdd4db", borderRadius: 6, padding: 8, font: "inherit", fontSize: 13 }} />
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn-primary" onClick={bulkAdd} disabled={pending}>一括で末尾に追加</button>
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: "#5b6470", margin: "6px 2px 8px" }}>
              各行の <strong>↥挿入</strong> でその行の前に範囲を入れられます。番号は自動で詰め直されます。
            </p>

            {sel.units.length === 0 ? (
              <p className="empty" style={{ fontSize: 13 }}>範囲がまだありません。上の入力欄から追加できます。</p>
            ) : (
              <ol className="mws-range-list">
                {sel.units.map((u, idx) => (
                  <RangeRow key={u.id} materialId={sel.id} unit={u} pos={idx + 1} files={filesByUnit(u.id)} onChanged={onChanged} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ワークスペース本体
// -----------------------------------------------------------------------------
export function MaterialsWorkspace({
  materials,
  selected,
  subjects,
}: {
  materials: WsMaterial[];
  selected: WsSelected | null;
  subjects: string[];
}) {
  SUBJECTS_GLOBAL = subjects;
  const router = useRouter();
  const refresh = () => router.refresh();
  const select = (id: string) => router.push(`/materials?m=${id}`);

  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState(subjects[0]);
  const [newProgress, setNewProgress] = useState("chapter");
  const [pending, startTransition] = useTransition();
  const newNameRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(key) || m.subject.toLowerCase().includes(key));
  }, [q, materials]);

  function addMaterial() {
    if (!newName.trim()) { toast.warning("教材名を入力してください。"); return; }
    const fd = new FormData();
    fd.set("name", newName.trim());
    fd.set("subject", newSubject);
    fd.set("progressType", newProgress);
    startTransition(async () => {
      try {
        const res = await quickAddMaterial(fd);
        toast.success(`教材「${res.name}」を追加しました。`);
        setNewName("");
        select(res.id); // 追加した教材を選択して範囲編集へ
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "追加に失敗しました。");
      }
    });
  }

  return (
    <div>
      <div className="mws-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="教材を検索" style={{ ...ctrl, height: 40, width: 240 }} />
        <button type="button" className="btn-primary" onClick={() => { setAddOpen((v) => !v); setTimeout(() => newNameRef.current?.focus(), 0); }}>
          ＋ 教材追加
        </button>
        <span className="metric-chip" style={{ marginLeft: "auto" }}>表示 {filtered.length} 件</span>
      </div>

      {addOpen && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={newSubject} onChange={(e) => setNewSubject(e.target.value)} style={{ ...ctrl, height: 38 }}>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input ref={newNameRef} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }} placeholder="教材名を入力" style={{ ...ctrl, height: 38, flex: "1 1 220px", minWidth: 160 }} />
          <select value={newProgress} onChange={(e) => setNewProgress(e.target.value)} style={{ ...ctrl, height: 38 }}>
            {PROGRESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className="btn-primary" onClick={addMaterial} disabled={pending}>{pending ? "追加中…" : "追加して範囲を編集"}</button>
        </div>
      )}

      <div className="mws-split">
        {/* 左: 教材リスト */}
        <div className="card mws-list-card">
          <div className="mws-list-head">
            <span style={{ width: 46 }}>開く</span>
            <span style={{ width: 84 }}>教科</span>
            <span style={{ flex: "1 1 140px" }}>教材名</span>
            <span style={{ width: 76 }}>進み方</span>
            <span style={{ width: 108 }}>完了後</span>
            <span className="mws-summary-head">範囲</span>
            <span style={{ width: 46 }} />
            <span style={{ width: 96 }}>操作</span>
          </div>
          <div className="mws-list-body">
            {filtered.length === 0 ? (
              <p className="empty" style={{ padding: 16 }}>教材がありません。「＋ 教材追加」から作成してください。</p>
            ) : (
              filtered.map((m) => (
                <MaterialListRow key={m.id} m={m} selected={selected?.id === m.id} onSelect={() => select(m.id)} onChanged={refresh} />
              ))
            )}
          </div>
        </div>

        {/* 右: 範囲編集 */}
        <div className="card mws-detail-card">
          {selected ? (
            <RangePanel sel={selected} onChanged={refresh} />
          ) : (
            <div className="mws-panel-head">
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>範囲編集</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.85 }}>教材を選択してください。</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
