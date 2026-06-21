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
import path from "node:path";

const LOCAL_DIR = path.join(process.cwd(), ".uploads");
const LOCAL_PREFIX = "local://";

export interface StoredBlob {
  url: string; // Blob時は公開URL、ローカル時は "local://<pathname>"
  pathname: string;
}

function hasBlobToken(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
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
