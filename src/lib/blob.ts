/**
 * ファイル保存の抽象化。
 *
 * - BLOB_READ_WRITE_TOKEN があれば Vercel Blob に保存。
 * - 無ければローカルの ./.uploads に保存 (開発用フォールバック)。
 *
 * いずれの場合も実体 URL はクライアントへ直接渡さず、必ず認証付きの
 * 配信ルート (/api/files/...) を経由して読み出す (権限確認のため)。
 * DB には pathname と (Blob時の) url を保存する。
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// Vercel ではプロジェクト配下が読み取り専用なので /tmp を使う (デモ/フォールバック用)。
// ローカル開発では ./.uploads (gitignore 済) に置く。
const LOCAL_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "kumon-uploads")
  : path.join(process.cwd(), ".uploads");
const LOCAL_PREFIX = "local://";

export interface StoredBlob {
  url: string; // Blob時は公開URL、ローカル時は "local://<pathname>"
  pathname: string;
}

const DB_PREFIX = "db://";

function hasBlobToken(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * ファイルを保存し、DB行へ格納する値を返す。
 * - Blob設定あり → Vercel Blob に保存し url を返す(dataB64 は null)。
 * - Blob設定なし → 実体を DB に base64 で保持(Vercelの /tmp 揮発でファイルが
 *   消えて 404 になる問題を回避)。blobUrl は "db://<pathname>"。
 */
export async function saveFile(
  pathname: string,
  data: Buffer | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<{ blobUrl: string; pathname: string; dataB64: string | null }> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  if (hasBlobToken()) {
    const stored = await saveBlob(pathname, buffer, contentType);
    return { blobUrl: stored.url, pathname: stored.pathname, dataB64: null };
  }
  return { blobUrl: DB_PREFIX + pathname, pathname, dataB64: buffer.toString("base64") };
}

/**
 * DB行(blobUrl/pathname/dataB64)から実体を取り出す。
 * dataB64 があればそれを優先(DB保持分)、無ければ Blob/ローカルから読む。
 */
export async function readStored(row: {
  blobUrl: string;
  pathname: string;
  dataB64?: string | null;
  contentType?: string | null;
}): Promise<{ body: Buffer; contentType: string } | null> {
  if (row.dataB64) {
    return {
      body: Buffer.from(row.dataB64, "base64"),
      contentType: row.contentType || guessContentType(row.pathname),
    };
  }
  return readBlob(row.blobUrl, row.pathname);
}

/** ファイルを保存し、url と pathname を返す。 */
export async function saveBlob(
  pathname: string,
  data: Buffer | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<StoredBlob> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

  if (hasBlobToken()) {
    const { put } = await import("@vercel/blob");
    const res = await put(pathname, buffer, {
      access: "public",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    return { url: res.url, pathname: res.pathname };
  }

  // local fallback
  const dest = path.join(LOCAL_DIR, pathname);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
  return { url: LOCAL_PREFIX + pathname, pathname };
}

/** url/pathname から実体を読み出し、bytes と contentType を返す。 */
export async function readBlob(
  url: string,
  pathname: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (url.startsWith(LOCAL_PREFIX) || !hasBlobToken()) {
    try {
      const src = path.join(LOCAL_DIR, pathname);
      const body = await fs.readFile(src);
      return { body, contentType: guessContentType(pathname) };
    } catch {
      return null;
    }
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  const arrayBuf = await res.arrayBuffer();
  return {
    body: Buffer.from(arrayBuf),
    contentType: res.headers.get("content-type") ?? guessContentType(pathname),
  };
}

/** Blob/ローカルから削除。 */
export async function deleteBlob(url: string, pathname: string): Promise<void> {
  if (url.startsWith(LOCAL_PREFIX) || !hasBlobToken()) {
    try {
      await fs.unlink(path.join(LOCAL_DIR, pathname));
    } catch {
      // ignore
    }
    return;
  }
  const { del } = await import("@vercel/blob");
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
}

function guessContentType(pathname: string): string {
  const ext = path.extname(pathname).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
