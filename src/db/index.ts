/**
 * DB クライアント (デュアルドライバ)。
 *
 * - 本番(Vercel) / Neon: `@neondatabase/serverless` の Pool + drizzle-orm/neon-serverless
 *   を使用。WebSocket 経由でサーバーレスでも安全に動き、トランザクションも使える。
 * - ローカル(Docker Postgres など TCP 直結): postgres.js を使用。
 *
 * 判定: VERCEL 環境 / 接続文字列が *.neon.tech / DB_DRIVER=neon のいずれかで Neon ドライバ。
 * どちらのドライバでも drizzle のクエリ API は同一なので、アプリ側は db をそのまま使う。
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ws from "ws";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL が未設定です。.env をコピーして接続文字列を設定してください。",
  );
}

const useNeon =
  !!process.env.VERCEL ||
  process.env.DB_DRIVER === "neon" ||
  /\.neon\.tech/.test(connectionString);

// ホットリロード/サーバーレスでクライアントを再利用するためグローバルにキャッシュ。
const globalForDb = globalThis as unknown as {
  __db?: PostgresJsDatabase<typeof schema>;
};

function createDb(): PostgresJsDatabase<typeof schema> {
  if (useNeon) {
    // Node 環境で global WebSocket が無ければ ws を注入 (Neon は WebSocket を使う)。
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const pool = new Pool({ connectionString });
    // 型はドライバ間で実質同一のため共通型へ寄せる。
    return drizzleNeon(pool, { schema }) as unknown as PostgresJsDatabase<
      typeof schema
    >;
  }

  const client = postgres(connectionString as string, { max: 10, prepare: false });
  return drizzlePg(client, { schema });
}

export const db: PostgresJsDatabase<typeof schema> =
  globalForDb.__db ?? createDb();

if (process.env.NODE_ENV !== "production") globalForDb.__db = db;

export { schema };
