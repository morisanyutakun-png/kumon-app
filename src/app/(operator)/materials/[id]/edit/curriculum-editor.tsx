"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addUnit,
  insertUnitBefore,
  removeMaterialFile,
  removeUnit,
  renameUnit,
  saveMaterialMeta,
  uploadMaterialFile,
} from "@/lib/actions/admin-actions";

export interface EditorFile {
  id: string;
  fileName: string;
  unitId: string | null;
}
export interface EditorUnit {
  id: string;
  title: string;
}
export interface EditorMaterial {
  id: string;
  name: string;
  subject: string;
  description: string;
  progressType: string;
  completionAction: string;
  numberStart: number | null;
  numberEnd: number | null;
}

const PROGRESS_OPTIONS = [
  { value: "chapter", label: "章ごと（範囲を並べて進む）" },
  { value: "number", label: "番号ごと（1〜Nで進む）" },
  { value: "manual", label: "手入力（範囲を都度指定）" },
];

const cellInput: React.CSSProperties = {
  height: 38,
  border: "1px solid #cdd4db",
  padding: "0 10px",
  font: "inherit",
  fontSize: 14,
  background: "#fff",
  width: "100%",
};

/** 1つの範囲(または教材全体)へPDF/画像を割り当てるファイル欄。 */
function FileSlot({
  materialId,
  unitId,
  files,
  onChanged,
}: {
  materialId: string;
  unitId: string | null;
  files: EditorFile[];
  onChanged: () => void;
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {files.map((f) => (
        <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <a href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">
            📎 {f.fileName}
          </a>
          <button
            type="button"
            onClick={() => del(f.id, f.fileName)}
            disabled={pending}
            title="削除"
            style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13 }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        onChange={onPicked}
        style={{ display: "none" }}
      />
      <button
        type="button"
        className="db-badge"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        style={{ cursor: "pointer", color: "var(--primary)", borderColor: "var(--primary)" }}
      >
        {pending ? "アップロード中…" : files.length > 0 ? "＋ 追加" : "＋ PDFを割り当て"}
      </button>
    </div>
  );
}

/** 範囲(単元)1行: 番号・範囲名(即時保存)・この行の前に挿入・削除・PDF割当。 */
function RangeRow({
  materialId,
  unit,
  pos,
  files,
  onChanged,
}: {
  materialId: string;
  unit: EditorUnit;
  pos: number;
  files: EditorFile[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(unit.title);
  const [pending, startTransition] = useTransition();

  function saveTitle() {
    if (title.trim() === unit.title.trim()) return;
    startTransition(async () => {
      try {
        await renameUnit(unit.id, title);
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "保存に失敗しました。");
      }
    });
  }

  function insertBefore() {
    startTransition(async () => {
      try {
        await insertUnitBefore(materialId, pos);
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "挿入に失敗しました。");
      }
    });
  }

  function del() {
    if (!window.confirm(`範囲「${unit.title || "(空)"}」を削除しますか?`)) return;
    startTransition(async () => {
      try {
        await removeUnit(unit.id);
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "削除に失敗しました。");
      }
    });
  }

  return (
    <tr>
      <td style={{ textAlign: "center", color: "#5b6470", width: 44 }}>{pos}</td>
      <td>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="範囲名（例: たし算①）"
          style={cellInput}
        />
      </td>
      <td>
        <FileSlot materialId={materialId} unitId={unit.id} files={files} onChanged={onChanged} />
      </td>
      <td className="right" style={{ width: 150, whiteSpace: "nowrap" }}>
        <button type="button" className="db-badge" onClick={insertBefore} disabled={pending} style={{ cursor: "pointer" }} title="この行の前に範囲を挿入">
          ↥ 挿入
        </button>{" "}
        <button type="button" className="db-badge" onClick={del} disabled={pending} style={{ cursor: "pointer", color: "#b91c1c", borderColor: "#f0b4b4" }}>
          削除
        </button>
      </td>
    </tr>
  );
}

export function CurriculumEditor({
  material,
  units,
  files,
  subjects,
}: {
  material: EditorMaterial;
  units: EditorUnit[];
  files: EditorFile[];
  subjects: string[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  // --- 教材メタ (保存ボタンで確定) ---
  const [name, setName] = useState(material.name);
  const [subject, setSubject] = useState(material.subject || subjects[0]);
  const [description, setDescription] = useState(material.description);
  const [progressType, setProgressType] = useState(material.progressType);
  const [completionAction, setCompletionAction] = useState(material.completionAction);
  const [numberStart, setNumberStart] = useState(material.numberStart?.toString() ?? "");
  const [numberEnd, setNumberEnd] = useState(material.numberEnd?.toString() ?? "");
  const [savingMeta, startMeta] = useTransition();

  function saveMeta() {
    startMeta(async () => {
      try {
        await saveMaterialMeta(material.id, {
          name,
          subject,
          description,
          progressType,
          completionAction,
          numberStart: numberStart ? Number(numberStart) : null,
          numberEnd: numberEnd ? Number(numberEnd) : null,
        });
        toast.success("教材を保存しました。");
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "保存に失敗しました。");
      }
    });
  }

  // --- 範囲追加 ---
  const [newRange, setNewRange] = useState("");
  const [addingRange, startAdd] = useTransition();
  const newRangeRef = useRef<HTMLInputElement>(null);

  function add() {
    if (!newRange.trim()) {
      toast.warning("範囲名を入力してください。");
      return;
    }
    startAdd(async () => {
      try {
        await addUnit(material.id, newRange);
        setNewRange("");
        newRangeRef.current?.focus();
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "追加に失敗しました。");
      }
    });
  }

  const materialFiles = files.filter((f) => f.unitId === null);
  const filesByUnit = (unitId: string) => files.filter((f) => f.unitId === unitId);

  return (
    <div className="space-y-4">
      {/* 教材メタ */}
      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>教材の設定</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ gridColumn: "1 / -1", display: "block" }}>
            <span style={{ fontSize: 13, color: "#5b6470" }}>教材名 *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} style={cellInput} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "#5b6470" }}>教科</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={cellInput}>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "#5b6470" }}>進め方</span>
            <select value={progressType} onChange={(e) => setProgressType(e.target.value)} style={cellInput}>
              {PROGRESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {progressType === "number" && (
            <>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 13, color: "#5b6470" }}>開始番号</span>
                <input type="number" min={1} value={numberStart} onChange={(e) => setNumberStart(e.target.value)} style={cellInput} />
              </label>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 13, color: "#5b6470" }}>終了番号</span>
                <input type="number" min={1} value={numberEnd} onChange={(e) => setNumberEnd(e.target.value)} style={cellInput} />
              </label>
            </>
          )}
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "#5b6470" }}>完了時の動作</span>
            <select value={completionAction} onChange={(e) => setCompletionAction(e.target.value)} style={cellInput}>
              <option value="delete">完了で割当終了</option>
              <option value="review_loop">総復習を反復</option>
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1", display: "block" }}>
            <span style={{ fontSize: 13, color: "#5b6470" }}>説明（生徒に表示）</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...cellInput, height: "auto", padding: 10 }} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn-primary" onClick={saveMeta} disabled={savingMeta}>
            {savingMeta ? "保存中…" : "教材設定を保存"}
          </button>
        </div>
      </div>

      {/* 教材全体のファイル */}
      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>教材全体のファイル</h2>
        <p style={{ fontSize: 13, color: "#5b6470", marginBottom: 10 }}>
          どの範囲でも表示される共通ファイル（教材冊子・解答など）。
        </p>
        <FileSlot materialId={material.id} unitId={null} files={materialFiles} onChanged={refresh} />
      </div>

      {/* 範囲(カリキュラム) */}
      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>範囲（カリキュラム）</h2>
        {progressType === "manual" ? (
          <p style={{ fontSize: 13, color: "#5b6470" }}>
            手入力教材のため範囲登録は不要です。添削結果入力画面で範囲を毎回入力します。進め方を「章ごと」に変えると範囲を並べられます。
          </p>
        ) : progressType === "number" ? (
          <p style={{ fontSize: 13, color: "#5b6470" }}>
            番号教材は範囲行の登録なしで、開始〜終了番号とペースで自動的に進みます。
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#5b6470", marginBottom: 10 }}>
              範囲を上から順に並べます。各範囲に問題PDFを割り当てられます。番号は自動で振り直されます。
            </p>
            <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
              <table className="record-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th style={{ width: "34%" }}>範囲名</th>
                    <th>割り当てPDF / 画像</th>
                    <th className="right" style={{ width: 150 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u, idx) => (
                    <RangeRow
                      key={u.id}
                      materialId={material.id}
                      unit={u}
                      pos={idx + 1}
                      files={filesByUnit(u.id)}
                      onChanged={refresh}
                    />
                  ))}
                  <tr style={{ background: "#f3f9fc" }}>
                    <td style={{ textAlign: "center", color: "#5b6470" }}>＋</td>
                    <td>
                      <input
                        ref={newRangeRef}
                        value={newRange}
                        onChange={(e) => setNewRange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            add();
                          }
                        }}
                        placeholder="範囲を末尾に追加"
                        style={cellInput}
                      />
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>追加後にPDFを割り当て</td>
                    <td className="right">
                      <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={add} disabled={addingRange}>
                        {addingRange ? "追加中…" : "＋ 追加"}
                      </button>
                    </td>
                  </tr>
                  {units.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 16, fontSize: 13 }}>
                        範囲がまだありません。上の入力欄から追加してください。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
