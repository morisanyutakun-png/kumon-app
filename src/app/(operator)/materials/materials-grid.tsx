"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteMaterial, quickAddMaterial, uploadMaterialFile } from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { FileUploadForm } from "@/components/file-upload-form";

export const SUBJECTS = ["算数", "国語", "理科", "社会", "英語", "プログラミング", "その他"];
export const PROGRESS_OPTIONS: { value: string; label: string }[] = [
  { value: "manual", label: "手入力（範囲を都度指定）" },
  { value: "chapter", label: "章ごと（単元で進む）" },
  { value: "number", label: "番号ごと（1〜Nで進む）" },
];
const PROGRESS_LABEL: Record<string, string> = {
  manual: "手入力",
  chapter: "章ごと",
  number: "番号ごと",
};

export interface MaterialRow {
  id: string;
  name: string;
  subject: string;
  progressType: string;
  files: { id: string; fileName: string }[];
}

const cellInput: React.CSSProperties = {
  width: "100%",
  height: 38,
  border: "1px solid #cdd4db",
  padding: "0 10px",
  font: "inherit",
  fontSize: 14,
  background: "#fff",
};

export function MaterialsGrid({ materials }: { materials: MaterialRow[] }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("算数");
  const [progressType, setProgressType] = useState("manual");
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  function add() {
    if (!name.trim()) {
      toast.warning("教材名を入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("subject", subject);
    fd.set("progressType", progressType);
    startTransition(async () => {
      try {
        const res = await quickAddMaterial(fd);
        toast.success(`教材「${res.name}」を追加しました。`);
        setName("");
        nameRef.current?.focus();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "追加に失敗しました。");
      }
    });
  }

  return (
    <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
      <table className="record-table" style={{ minWidth: 820 }}>
        <thead>
          <tr>
            <th style={{ width: 110 }}>教科</th>
            <th style={{ width: "28%" }}>教材名</th>
            <th style={{ width: 130 }}>進め方</th>
            <th>課題ファイル</th>
            <th className="right" style={{ width: 150 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}>
              <td>{m.subject ? <span className="badge">{m.subject}</span> : <span className="muted">—</span>}</td>
              <td style={{ fontWeight: 600 }}>{m.name}</td>
              <td className="muted">{PROGRESS_LABEL[m.progressType] ?? m.progressType}</td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                  {m.files.map((f) => (
                    <a key={f.id} href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">📎 {f.fileName}</a>
                  ))}
                  <FileUploadForm action={uploadMaterialFile.bind(null, m.id)} accept="application/pdf,image/*" buttonLabel="ファイル追加" />
                </div>
              </td>
              <td className="right">
                <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                  <Link href={`/materials/${m.id}/edit`} className="db-badge">編集</Link>
                  <ActionButton action={deleteMaterial.bind(null, m.id)} variant="destructive" confirm={`教材「${m.name}」を削除しますか?`} successMessage="削除しました。">削除</ActionButton>
                </span>
              </td>
            </tr>
          ))}

          <tr style={{ background: "#f3f9fc" }}>
            <td>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} style={cellInput}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
            <td>
              <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="教材名を入力" style={cellInput} />
            </td>
            <td>
              <select value={progressType} onChange={(e) => setProgressType(e.target.value)} style={cellInput}>
                {PROGRESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{PROGRESS_LABEL[o.value]}</option>)}
              </select>
            </td>
            <td className="muted">追加後にファイルや範囲を設定</td>
            <td className="right">
              <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={add} disabled={pending}>
                {pending ? "追加中…" : "＋ 追加"}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
