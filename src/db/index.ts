/**
 * DB クライアント (デュアルドライバ + 遅延初期化)。
 *
 * - 本番(Vercel) / Neon: `@neondatabase/serverless` の Pool + drizzle-orm/neon-serverless
 *   を使用。WebSocket 経由でサーバーレスでも安全に動き、トランザクションも使える。
 * - ローカル(Docker Postgres など TCP 直結): postgres.js を使用。
 *
 * 判定: VERCEL 環境 / 接続文字列が *.neon.tech / DB_DRIVER=neon のいずれかで Neon ドライバ。
 *
 * 遅延初期化: `next build` のページデータ収集では各ルートが import されるだけで
 * 実際の DB アクセスは行われない。そこで接続は「最初に db を使った時」に作る。
 * これにより DATABASE_URL がビルド時に無くてもビルドは通り、実行時にだけ必要になる。
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ws from "ws";

import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: DB };

function createDb(): DB {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL が未設定です。ローカルは .env を、Vercel は Project Settings → Environment Variables に設定してください。",
    );
  }

  const useNeon =
    !!process.env.VERCEL ||
    process.env.DB_DRIVER === "neon" ||
    /\.neon\.tech/.test(connectionString);

  if (useNeon) {
    // Node 環境で global WebSocket が無ければ ws を注入 (Neon は WebSocket を使う)。
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

/**
 * 遅延初期化された drizzle クライアント。プロパティに初めてアクセスした時点で
 * 実際の接続を作る (import だけでは接続しない)。
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const instance = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as DB;

export { schema };
