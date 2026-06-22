/* drizzle/*.sql(全マイグレーション)を順に連結して デモ(PGlite)用 DDL を再生成する。 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = "drizzle";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = files
  .map((f) => readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint").join("\n"))
  .join("\n");

const out = `/**
 * デモ(PGlite)用 DDL。drizzle/*.sql(全マイグレーション)から自動生成。
 * スキーマを変更したら \`npm run demo:ddl\` で再生成すること。
 */
export const DEMO_DDL = ${JSON.stringify(sql)};
`;

writeFileSync("src/db/demo-ddl.ts", out);
console.log(`generated src/db/demo-ddl.ts from ${files.length} migration(s) (${sql.length} chars)`);
