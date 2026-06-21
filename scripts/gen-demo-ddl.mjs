/* drizzle/0000_init.sql から デモ(PGlite)用 DDL を再生成する。 */
import { readFileSync, writeFileSync } from "node:fs";

const sql = readFileSync("drizzle/0000_init.sql", "utf8").split(
  "--> statement-breakpoint",
).join("\n");

const out = `/**
 * デモ(PGlite)用 DDL。drizzle/0000_init.sql から自動生成。
 * スキーマを変更したら \`npm run demo:ddl\` で再生成すること。
 */
export const DEMO_DDL = ${JSON.stringify(sql)};
`;

writeFileSync("src/db/demo-ddl.ts", out);
console.log(`generated src/db/demo-ddl.ts (${sql.length} chars)`);
