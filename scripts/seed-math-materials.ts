/**
 * 算数プリント教材を DB に登録する (冪等)。
 *
 *   1) materials-tex/dist/<id>.pdf (問題) と <id>_kai.pdf (解答) を読む
 *   2) materials を name で upsert (1プリント=1教材, subject=算数, manual)
 *   3) units を 1 つ用意 (表示用。title=プリント名, rangeText=サブタイトル)
 *   4) material_files を作り直す (問題=assignment / 解答=answer_key)
 *
 * 事前に PDF をビルドしておくこと:
 *   node scripts/build-materials.mjs
 *
 * 実行 (env を読み込んでから):
 *   set -a && . ./.env && set +a && npx tsx scripts/seed-math-materials.ts
 *
 * 対象組織は既定で「組織が1つだけならそれ」。複数ある場合は ORG_NAME か ORG_ID で指定:
 *   ORG_NAME="さくら学習教室" npx tsx scripts/seed-math-materials.ts
 *
 * 確認のみ(書き込まない)で実行:
 *   DRY_RUN=1 npx tsx scripts/seed-math-materials.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials, organizations, units } from "@/db/schema";
import { saveFile } from "@/lib/blob";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "materials-tex", "dist");
const DRY = process.env.DRY_RUN === "1";

async function pickOrg() {
  const orgs = await db.select().from(organizations);
  if (orgs.length === 0) throw new Error("組織が1つもありません。先に seed を実行してください。");
  if (process.env.ORG_ID) {
    const o = orgs.find((x) => x.id === process.env.ORG_ID);
    if (!o) throw new Error(`ORG_ID=${process.env.ORG_ID} の組織が見つかりません。`);
    return o;
  }
  if (process.env.ORG_NAME) {
    const o = orgs.find((x) => x.name === process.env.ORG_NAME);
    if (!o) throw new Error(`ORG_NAME=${process.env.ORG_NAME} の組織が見つかりません。`);
    return o;
  }
  if (orgs.length > 1) {
    throw new Error(
      `組織が複数あります。ORG_NAME か ORG_ID で指定してください:\n` +
        orgs.map((o) => `  - ${o.name} (${o.id})`).join("\n"),
    );
  }
  return orgs[0];
}

async function main() {
  const { prints } = (await import(join(ROOT, "materials-tex", "manifest.mjs"))) as {
    prints: Array<{
      id: string;
      grade: number;
      unitNo: number;
      subject: string;
      name: string;
      title: string;
      subtitle: string;
      goal: string;
      desc?: string;
    }>;
  };

  const org = await pickOrg();
  const organizationId = org.id;
  console.log(`組織: ${org.name} (${organizationId})${DRY ? "  [DRY RUN]" : ""}`);
  console.log(`プリント数: ${prints.length}`);

  let created = 0;
  let updated = 0;
  for (const p of prints) {
    const qPdf = join(DIST, `${p.id}.pdf`);
    const aPdf = join(DIST, `${p.id}_kai.pdf`);
    if (!existsSync(qPdf) || !existsSync(aPdf)) {
      console.error(`✗ ${p.id}: PDF がありません。先に build-materials.mjs を実行してください。`);
      continue;
    }

    // 教材を name で upsert
    let [m] = await db
      .select()
      .from(materials)
      .where(and(eq(materials.organizationId, organizationId), eq(materials.name, p.name)))
      .limit(1);

    const sortOrder = p.grade * 100 + p.unitNo;
    if (!m) {
      if (DRY) {
        console.log(`+ (new) ${p.name}`);
        created++;
        continue;
      }
      [m] = await db
        .insert(materials)
        .values({
          organizationId,
          subject: p.subject,
          name: p.name,
          description: p.desc ?? p.goal,
          progressType: "manual",
          completionAction: "delete",
          sortOrder,
        })
        .returning();
      created++;
    } else {
      if (!DRY) {
        await db
          .update(materials)
          .set({ subject: p.subject, description: p.desc ?? p.goal, sortOrder })
          .where(eq(materials.id, m.id));
      }
      updated++;
    }
    if (DRY) {
      console.log(`~ (exists) ${p.name}`);
      continue;
    }

    // 単元(表示用)を1つ用意
    const [u] = await db
      .select()
      .from(units)
      .where(and(eq(units.materialId, m.id)))
      .limit(1);
    if (!u) {
      await db.insert(units).values({
        organizationId,
        materialId: m.id,
        sortOrder: 0,
        title: p.title,
        rangeText: p.subtitle,
      });
    } else {
      await db
        .update(units)
        .set({ title: p.title, rangeText: p.subtitle })
        .where(eq(units.id, u.id));
    }

    // 既存ファイルを消して作り直す(冪等)
    await db.delete(materialFiles).where(eq(materialFiles.materialId, m.id));
    // 利用者が認識しやすいよう、ファイル名は日本語 (例: 小1算数-3.pdf / 小1算数-3-こたえ.pdf)。
    const jpBase = `小${p.grade}算数-${p.unitNo}`;
    for (const [path, kind, suffix, jpSuffix] of [
      [qPdf, "assignment", "", ""],
      [aPdf, "answer_key", "_kai", "-こたえ"],
    ] as const) {
      const buf = readFileSync(path);
      const fileName = `${jpBase}${jpSuffix}.pdf`;
      // 保存パスはASCIIで安全に (id ベース)。
      const pathname = `${organizationId}/materials/${m.id}/${p.id}${suffix}.pdf`;
      const stored = await saveFile(pathname, buf, "application/pdf");
      await db.insert(materialFiles).values({
        organizationId,
        materialId: m.id,
        kind,
        blobUrl: stored.blobUrl,
        pathname: stored.pathname,
        dataB64: stored.dataB64,
        fileName,
        contentType: "application/pdf",
        size: buf.length,
      });
    }
    console.log(`✓ ${p.name}  (問題+解答PDF)`);
  }

  console.log(`\n完了: 新規 ${created} / 更新 ${updated}${DRY ? "  (DRY RUN: 書き込みなし)" : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
