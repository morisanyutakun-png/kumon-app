/* 章ごと教材の自動前進を実 DB 行で検証。実行: npx tsx scripts/advance-db-test.ts */
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { materials, units } from "@/db/schema";
import { planAdvance } from "@/lib/progress-db";

async function main() {
  let pass = 0,
    fail = 0;
  const eqv = (n: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) === JSON.stringify(want)) pass++;
    else {
      fail++;
      console.log(`FAIL ${n}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    }
  };

  const [m] = await db
    .select()
    .from(materials)
    .where(eq(materials.name, "けいさんドリル B"))
    .limit(1);
  if (!m) {
    console.log("シードの章教材が無い (npm run db:seed を実行)");
    process.exit(1);
  }
  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.materialId, m.id))
    .orderBy(asc(units.sortOrder));
  eqv("units count", unitRows.length, 3);

  // progress 0 → B-1 合格で B-2 へ
  let r = planAdvance({ progressIndex: 0, unitsPerSession: 1, pointer: 1 }, m, unitRows);
  eqv("p0 progress", r.advance.progressIndex, 1);
  eqv("p0 next range", r.nextRange, "B-2");

  // progress 1 → B-3 へ
  r = planAdvance({ progressIndex: 1, unitsPerSession: 1, pointer: 2 }, m, unitRows);
  eqv("p1 next range", r.nextRange, "B-3");

  // progress 2 → 全範囲終了 → review_loop なので総復習
  r = planAdvance({ progressIndex: 2, unitsPerSession: 1, pointer: 3 }, m, unitRows);
  eqv("p2 inTotalReview", r.advance.inTotalReview, true);
  eqv("p2 next range", r.nextRange, "総復習");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
