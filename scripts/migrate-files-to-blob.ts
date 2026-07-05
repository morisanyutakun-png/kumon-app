/**
 * DBに base64 で保持しているファイル(material_files / submission_images の data_b64)を
 * Vercel Blob へ移行し、data_b64 を null にして Neon を軽くする。
 *
 * 仕組み: data_b64 を持つ行だけを対象に、実体を Blob へ put → 行を
 *   blob_url / pathname(新)= Blob の値、data_b64 = null に更新する。
 *   すでに Blob 済み(data_b64 が null)の行は触らないので、何度実行しても安全(冪等)。
 *
 * 前提: BLOB_READ_WRITE_TOKEN が設定されていること(未設定だと移行先が無いので中止)。
 *      本番を軽くしたいので、必ず「本番 Neon の DATABASE_URL」と「本番 Blob のトークン」で実行する。
 *
 * まず確認だけ(書き込まない):
 *   DRY_RUN=1 \
 *   DATABASE_URL="postgres://...neon.tech/..." \
 *   BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." \
 *   npx tsx scripts/migrate-files-to-blob.ts
 *
 * 本番実行(上の DRY_RUN=1 を外すだけ):
 *   DATABASE_URL="postgres://...neon.tech/..." \
 *   BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." \
 *   npx tsx scripts/migrate-files-to-blob.ts
 */
import path from "node:path";

import { eq, isNotNull } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { materialFiles, submissionImages } from "@/db/schema";
import { saveBlob } from "@/lib/blob";

const DRY_RUN = process.env.DRY_RUN === "1";

function guessType(pathname: string, fallback: string): string {
  if (fallback) return fallback;
  switch (path.extname(pathname).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function migrateTable(name: string, table: PgTableWithColumns<any>) {
  const t = table as any;
  // 1) data_b64 を持つ行の軽量メタだけ取得(巨大な base64 はここでは読まない)。
  const rows: { id: string; pathname: string; contentType: string }[] = await db
    .select({ id: t.id, pathname: t.pathname, contentType: t.contentType })
    .from(table)
    .where(isNotNull(t.dataB64));

  console.log(`\n[${name}] DB保持(data_b64)の対象: ${rows.length} 件`);
  let done = 0;
  let failed = 0;
  let bytes = 0;

  for (const r of rows) {
    try {
      // 2) 実体(base64)を1件ずつ取得(メモリを1ファイル分に抑える)。
      const [full]: { dataB64: string | null }[] = await db
        .select({ dataB64: t.dataB64 })
        .from(table)
        .where(eq(t.id, r.id))
        .limit(1);
      if (!full?.dataB64) continue;

      const buffer = Buffer.from(full.dataB64, "base64");
      bytes += buffer.length;
      const ctype = guessType(r.pathname, r.contentType);

      if (DRY_RUN) {
        console.log(`  [dry] ${r.id}  ${r.pathname}  ${mb(buffer.length)}`);
        done++;
        continue;
      }

      // 3) Blob へアップロード → 行を Blob 参照に更新し data_b64 を null 化。
      const stored = await saveBlob(r.pathname, buffer, ctype);
      await db
        .update(table)
        .set({ blobUrl: stored.url, pathname: stored.pathname, dataB64: null })
        .where(eq(t.id, r.id));
      done++;
      console.log(`  ✓ ${r.id}  → ${stored.url}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${r.id} 失敗:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[${name}] 完了 ${done}/${rows.length} 件` + (failed ? ` (失敗 ${failed})` : "") + ` / 実体 ${mb(bytes)}`);
  return { done, failed, total: rows.length, bytes };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("✗ BLOB_READ_WRITE_TOKEN が未設定です。先に Vercel Blob のトークンを用意し、環境変数に入れてから実行してください。");
    process.exit(1);
  }
  console.log(DRY_RUN ? "=== DRY RUN(書き込みません)===" : "=== 移行を実行します(Blobへアップロード＆data_b64をnull化)===");

  const a = await migrateTable("material_files", materialFiles);
  const b = await migrateTable("submission_images", submissionImages);

  const totalDone = a.done + b.done;
  const totalFail = a.failed + b.failed;
  const rawBytes = a.bytes + b.bytes;
  console.log(`\n===== 集計 =====`);
  console.log(`移行 ${totalDone} 件` + (totalFail ? ` / 失敗 ${totalFail} 件` : ""));
  // base64 は実体比 約+33%。DBから概ねこのぶんのテキストが消える。
  console.log(`DB削減見込み(base64換算): 約 ${mb(rawBytes * 1.34)}`);
  if (!DRY_RUN) {
    console.log("data_b64 を null 化しました。Neon の物理容量を実際に回収するには、対象テーブルへ VACUUM (FULL) の実行を検討してください。");
  }
  process.exit(totalFail > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
