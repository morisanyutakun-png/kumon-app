import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials } from "@/db/schema";
import { requireOperator } from "@/lib/access";
import {
  createMaterial,
  deleteMaterial,
  uploadMaterialFile,
} from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { FileUploadForm } from "@/components/file-upload-form";

const PROGRESS_LABEL: Record<string, string> = {
  manual: "手入力",
  chapter: "章ごと",
  number: "番号ごと",
};

export default async function MaterialsPage() {
  const p = await requireOperator();
  const rows = await db
    .select()
    .from(materials)
    .where(eq(materials.organizationId, p.organizationId))
    .orderBy(asc(materials.sortOrder), asc(materials.name));

  const files =
    rows.length > 0
      ? await db
          .select()
          .from(materialFiles)
          .where(inArray(materialFiles.materialId, rows.map((r) => r.id)))
      : [];
  const filesByMaterial = new Map<string, typeof files>();
  for (const f of files) {
    const arr = filesByMaterial.get(f.materialId) ?? [];
    arr.push(f);
    filesByMaterial.set(f.materialId, arr);
  }

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>教材管理</h1>
          <p>教材の登録・編集と、課題ファイル(PDF/画像)のアップロードを管理します。</p>
          <div className="metric-row">
            <span className="metric-chip">{rows.length} 件</span>
          </div>
        </div>
        <details className="action-menu">
          <summary className="btn-primary">教材を追加</summary>
          <div className="action-menu-body">
            <ActionForm action={createMaterial} submitLabel="登録する">
              <div className="form-row">
                <label htmlFor="name">教材名 *</label>
                <input id="name" name="name" required placeholder="たし算プリント A" />
              </div>
              <div className="form-row">
                <label htmlFor="subject">教科</label>
                <input id="subject" name="subject" placeholder="数学" />
              </div>
              <div className="form-row">
                <label htmlFor="description">説明</label>
                <textarea id="description" name="description" rows={3} />
              </div>
            </ActionForm>
          </div>
        </details>
      </div>

      <div className="card">
        <h2>教材一覧 ({rows.length}件)</h2>
        <div className="grid-scroll" style={{ border: "none" }}>
          <table className="record-table">
            <thead>
              <tr>
                <th>教科</th>
                <th>教材名</th>
                <th>進め方</th>
                <th>課題ファイル</th>
                <th className="right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="empty">教材がありません</td></tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.subject ? <span className="badge">{m.subject}</span> : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      {m.description && <div className="muted">{m.description}</div>}
                    </td>
                    <td className="muted">{PROGRESS_LABEL[m.progressType] ?? m.progressType}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                        {(filesByMaterial.get(m.id) ?? []).map((f) => (
                          <a key={f.id} href={`/api/files/material/${f.id}`} target="_blank" rel="noreferrer" className="db-badge">
                            📎 {f.fileName}
                          </a>
                        ))}
                        <FileUploadForm
                          action={uploadMaterialFile.bind(null, m.id)}
                          accept="application/pdf,image/*"
                          buttonLabel="ファイル追加"
                        />
                      </div>
                    </td>
                    <td className="right">
                      <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                        <Link href={`/materials/${m.id}/edit`} className="db-badge">編集</Link>
                        <ActionButton
                          action={deleteMaterial.bind(null, m.id)}
                          variant="destructive"
                          confirm={`教材「${m.name}」を削除しますか?`}
                          successMessage="削除しました。"
                        >
                          削除
                        </ActionButton>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
