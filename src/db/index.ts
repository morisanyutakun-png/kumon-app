/**
 * DB クライアント (デュアルドライバ + デモPGlite + 遅延初期化)。
 *
 * - デモ(ゲスト)モード: DATABASE_URL 無し or DEMO_MODE=1。PGlite (メモリ内Postgres) を
 *   使い、起動時に DDL + シードを自動投入。外部DB不要でそのまま動く/ブラウズできる。
 *   ※ データはインスタンス内でのみ保持され、再起動でリセットされる (デモ用途)。
 * - 本番(Vercel) / Neon: `@neondatabase/serverless` (WebSocket Pool, transaction可)。
 * - ローカル(Docker Postgres など TCP 直結): postgres.js。
 *
 * 遅延初期化: `next build` のページデータ収集では import されるだけで接続しない。
 * 接続は「最初に db を使った時」に作るため、ビルド時に DATABASE_URL が無くても通る。
 */
import { PGlite } from "@electric-sql/pglite";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ws from "ws";

import { DEMO_DDL } from "./demo-ddl";
import { DEMO_SEED } from "@/lib/demo";
import { isDemoMode } from "@/lib/demo";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: DB };

/**
 * デモ用 PGlite。PGlite は操作を内部キューで FIFO 処理するため、
 * DDL → シード を先に投入(キュー)してから drizzle を返せば、以降のクエリは
 * 必ずその後に実行される (明示的な待ち合わせ不要)。
 */
function createDemoDb(): DB {
  const pg = new PGlite();
  void pg.exec(DEMO_DDL).then(() => pg.exec(DEMO_SEED));
  return drizzlePglite(pg, { schema }) as unknown as DB;
}

function createDb(): DB {
  if (isDemoMode()) return createDemoDb();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL が未設定です。Vercel は Project Settings → Environment Variables に設定してください (未設定の場合はデモモードで起動します)。",
    );
  }

  const useNeon =
    !!process.env.VERCEL ||
    process.env.DB_DRIVER === "neon" ||
    /\.neon\.tech/.test(connectionString);

  if (useNeon) {
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const pool = new Pool({ connectionString });
    return drizzleNeon(pool, { schema }) as unknown as DB;
  }

  const client = postgres(connectionString, { max: 10, prepare: false });
  return drizzlePg(client, { schema });
}

function getDb(): DB {
  if (!globalForDb.__db) globalForDb.__db = createDb();
  return globalForDb.__db;
}

/** 遅延初期化された drizzle クライアント (import だけでは接続しない)。 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const instance = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as DB;

export { schema };
