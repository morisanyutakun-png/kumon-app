/**
 * 化学(総集編)を中高部教材として1件登録する(冪等)。
 *
 * 購入科目 chemistry → subject "化学"(src/lib/subject-map.ts)にマッチするため、
 * PROVISION_AUTO_ASSIGN=1 のとき、化学を購入して発行された生徒へ自動で割り当てられる。
 *
 * 実行(本番 Neon + Blob):
 *   DATABASE_URL="postgres://…neon.tech/…" \
 *   BLOB_READ_WRITE_TOKEN="vercel_blob_rw_…" \
 *   CHEM_PDF="/Users/moriyuuta/kumon_app/化学_総集編のコピー.pdf" \
 *   npx tsx scripts/seed-chemistry-material.ts
 *
 * 確認のみ(書き込まない): 先頭に DRY_RUN=1 を付ける。
 * 組織は既定で「1つだけならそれ」。複数なら ORG_ID か ORG_NAME を指定。
 */
import { existsSync, readFileSync } from "node:fs";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { materialFiles, materials, organizations } from "@/db/schema";
import { saveFile } from "@/lib/blob";

const DRY = process.env.DRY_RUN === "1";
const PDF = process.env.CHEM_PDF ?? "/Users/moriyuuta/kumon_app/化学_総集編のコピー.pdf";
const NAME = process.env.CHEM_NAME ?? "化学 総集編";
const SUBJECT = "化学"; // subject-map: chemistry → "化学"
const FILE_NAME = "化学_総集編.pdf";

async function resolveOrg() {
  const id = process.env.ORG_ID ?? process.env.NOBIT_PROVISION_ORG_ID;
  const orgs = await db.select().from(organizations);
  if (id) {
    const o = orgs.find((x) => x.id === id);
    if (!o) throw new Error(`組織 ${id} が見つかりません`);
    return o;
  }
  const name = process.env.ORG_NAME;
  if (name) {
    const o = orgs.find((x) => x.name === name);
    if (!o) throw new Error(`組織「${name}」が見つかりません`);
    return o;
  }
  if (orgs.length === 1) return orgs[0];
  throw new Error(`組織が複数あります。ORG_ID か ORG_NAME を指定してください: ${orgs.map((o) => o.name).join(", ")}`);
}

async function main() {
  if (!existsSync(PDF)) throw new Error(`PDFが見つかりません: ${PDF}`);
  const buf = readFileSync(PDF);
  const org = await resolveOrg();
  console.log(`組織: ${org.name} (${org.id})`);
  console.log(`PDF : ${PDF} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`教材: [${SUBJECT}] ${NAME} / division=secondary / progress=manual`);

  if (DRY) {
    console.log("\n=== DRY RUN: 書き込みなし ===");
    process.exit(0);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN が未設定です(Blobへアップロードできません)。");
  }

  // 教材を (org, name) で upsert。
  let [m] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, org.id), eq(materials.name, NAME)))
    .limit(1);
  if (!m) {
    [m] = await db
      .insert(materials)
      .values({
        organizationId: org.id,
        division: "secondary",
        subject: SUBJECT,
        name: NAME,
        description: "化学 類題プリント 総集編(全12分野 A気体と物質の状態〜L合成高分子・各3セット)。購入(chemistry)で自動割り当てされます。",
        progressType: "manual",
        completionAction: "delete",
        sortOrder: 0,
      })
      .returning();
    console.log(`+ 教材を作成: ${m.id}`);
  } else {
    await db
      .update(materials)
      .set({ division: "secondary", subject: SUBJECT })
      .where(eq(materials.id, m.id));
    console.log(`~ 既存教材を更新: ${m.id}`);
  }

  // ファイルを作り直す(冪等)。
  await db.delete(materialFiles).where(eq(materialFiles.materialId, m.id));
  const pathname = `${org.id}/materials/${m.id}/chemistry.pdf`;
  console.log(`Blobへアップロード中… (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
  const stored = await saveFile(pathname, buf, "application/pdf");
  await db.insert(materialFiles).values({
    organizationId: org.id,
    materialId: m.id,
    kind: "assignment",
    blobUrl: stored.blobUrl,
    pathname: stored.pathname,
    dataB64: stored.dataB64,
    fileName: FILE_NAME,
    contentType: "application/pdf",
    size: buf.length,
  });

  console.log(`✓ 化学教材 登録完了 (material=${m.id}, subject=${SUBJECT})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
