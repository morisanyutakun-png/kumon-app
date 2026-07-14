/**
 * お試し(3課題)教材を中高部教材として登録する(冪等)。
 *
 * yuta-eng の「お試し(1教材¥1,980・3課題ぶん)」に対応する専用教材を作る。
 * 中身は各科目の既存「総集編/標準」PDFの【先頭3課題】を切り出したもの:
 *   - 1課題(セット/演習) = 1範囲(unit)
 *   - 問題PDF     = material_files.kind "assignment"
 *   - 解答解説PDF = material_files.kind "answer_key"
 * 割り当ては既存経路(subject-map の *-trial ターゲット → assign-purchased)で行うため、
 * ここでは「お試し」を名前に含む教材を作るだけでよい(上限カウント等の新規ロジック不要)。
 *
 * 実行:
 *   set -a && . ./.env && set +a && npm run materials:seed-trial            # 既定 math-1a
 *   TRIAL_TARGET=math-2bc npm run materials:seed-trial                       # 他科目
 *   TRIAL_TARGET=all npm run materials:seed-trial                            # 全お試し
 * 確認のみ(書き込まない): DRY_RUN=1 を付ける。
 * 本登録には BLOB_READ_WRITE_TOKEN が必要(PDF実体はNeonに入れずBlobへ)。
 * 組織は既定で「1つだけならそれ」。複数なら ORG_ID か ORG_NAME を指定。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";

import { db } from "@/db";
import {
  assignments,
  materialFiles,
  materials,
  organizations,
  submissions,
  units,
} from "@/db/schema";
import { saveFile } from "@/lib/blob";

const DRY = process.env.DRY_RUN === "1";
const ROOT = "/Users/moriyuuta/kumon_app";
const TRIAL_UNIT_COUNT = Number(process.env.TRIAL_COUNT ?? 3); // お試しは先頭3課題

/**
 * 「セット式」総集編(化学/数学IA/数学IIBC/英語長文)は同一マーカー体系:
 *   問題ページ  … 「… 標準／<分野> ／ <点数>  セット A-1」
 *   解答ページ  … 「… 標準／<分野> 解答・解説  セット A-1」
 */
interface TrialConfig {
  target: string; // TRIAL_TARGET で選ぶキー
  purchaseId: string; // yuta-eng のお試し購入ID(例 math-1a-trial)。pathname に使用
  trialOf: string; // 対応するフル科目ID(例 math-1a)
  name: string; // 教材名(「お試し」を必ず含める=subject-map の nameIncludes)
  subject: string; // materials.subject(subject-map の subjects と一致させる)
  pdfPath: string;
  sortOrder: number;
  description: string;
}

function rootPdf(defaultName: string, envValue?: string): string {
  if (envValue) return envValue;
  const direct = join(ROOT, defaultName);
  if (existsSync(direct)) return direct;
  const normalized = defaultName.normalize("NFC");
  const match = readdirSync(ROOT).find((name) => name.normalize("NFC") === normalized);
  return match ? join(ROOT, match) : direct;
}

const TRIAL_CONFIGS: TrialConfig[] = [
  {
    target: "math-1a",
    purchaseId: "math-1a-trial",
    trialOf: "math-1a",
    name: "数学IA標準 お試し",
    subject: "数学IA",
    pdfPath: rootPdf("数学IA_総集編のコピー.pdf", process.env.MATH1A_PDF),
    sortOrder: 590,
    description:
      "数学IA標準 お試し(先頭3課題)。添削3回ぶんを実際の教材で体験できます。本契約で全範囲に進めます。購入(math-1a-trial)で自動割り当て。",
  },
  {
    target: "math-2bc",
    purchaseId: "math-2bc-trial",
    trialOf: "math-2bc",
    name: "数学IIBC標準 お試し",
    subject: "数学IIBC",
    pdfPath: rootPdf("数学IIBC_総集編のコピー.pdf", process.env.MATH2BC_PDF),
    sortOrder: 591,
    description:
      "数学IIBC標準 お試し(先頭3課題)。添削3回ぶんを実際の教材で体験できます。本契約で全範囲に進めます。購入(math-2bc-trial)で自動割り当て。",
  },
  {
    target: "english-reading",
    purchaseId: "english-reading-trial",
    trialOf: "english-reading",
    name: "英語長文標準 お試し",
    subject: "英語長文",
    pdfPath: rootPdf("英語長文_総集編のコピー.pdf", process.env.ENGLISH_READING_PDF),
    sortOrder: 592,
    description:
      "英語長文標準 お試し(先頭3課題)。添削3回ぶんを実際の教材で体験できます。本契約で全範囲に進めます。購入(english-reading-trial)で自動割り当て。",
  },
  {
    target: "chemistry",
    purchaseId: "chemistry-trial",
    trialOf: "chemistry",
    name: "化学標準 お試し",
    subject: "化学",
    pdfPath: rootPdf("化学_総集編のコピー.pdf", process.env.CHEM_PDF),
    sortOrder: 593,
    description:
      "化学標準 お試し(先頭3課題)。添削3回ぶんを実際の教材で体験できます。本契約で全範囲に進めます。購入(chemistry-trial)で自動割り当て。",
  },
];

type FileKind = "assignment" | "answer_key";

interface PdfChunk {
  kind: FileKind;
  topic: string;
  setLabel: string;
  startPage: number; // 1-based
  endPage: number; // 1-based
}

interface UnitSource {
  title: string;
  problem: PdfChunk;
  answer: PdfChunk;
}

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

function pageText(pdfPath: string, page: number): string {
  return execFileSync("pdftotext", ["-layout", "-f", String(page), "-l", String(page), pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function compactTopic(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** 化学/数学/英語 総集編で共通のセットマーカー(seed-chemistry-material.ts と同一体系)。 */
function markerFromText(text: string): Omit<PdfChunk, "startPage" | "endPage"> | null {
  const set = text.match(/セット\s+([A-C])-(\d)/);
  if (!set) return null;
  const topic = text.match(/標準／(.+?)(?:\s+解答・解説|\s+／\s*\d+)/);
  if (!topic) return null;
  return {
    kind: text.includes("解答・解説") ? "answer_key" : "assignment",
    topic: compactTopic(topic[1]),
    setLabel: `${set[1]}-${set[2]}`,
  };
}

function sameChunk(a: PdfChunk, b: Omit<PdfChunk, "startPage" | "endPage">): boolean {
  return a.kind === b.kind && a.topic === b.topic && a.setLabel === b.setLabel;
}

async function parseChunks(pdfPath: string): Promise<PdfChunk[]> {
  const src = await PDFDocument.load(readFileSync(pdfPath));
  const chunks: PdfChunk[] = [];
  let current: PdfChunk | null = null;
  for (let page = 1; page <= src.getPageCount(); page++) {
    const marker = markerFromText(pageText(pdfPath, page));
    if (!marker) continue;
    if (current && sameChunk(current, marker)) {
      current.endPage = page;
      continue;
    }
    if (current) chunks.push(current);
    current = { ...marker, startPage: page, endPage: page };
  }
  if (current) chunks.push(current);
  return chunks;
}

function chunkKey(c: Pick<PdfChunk, "topic" | "setLabel">): string {
  return `${c.topic}::${c.setLabel}`;
}

/** 問題チャンクの先頭 n 件と、その解答解説を対にする(お試し=先頭3課題)。 */
function buildTrialUnits(chunks: PdfChunk[], n: number): UnitSource[] {
  const problems = chunks.filter((c) => c.kind === "assignment");
  const answers = new Map(chunks.filter((c) => c.kind === "answer_key").map((c) => [chunkKey(c), c]));
  if (problems.length < n) {
    throw new Error(`問題が ${n} 課題に満たない(検出 ${problems.length}件)。マーカー検出を確認してください。`);
  }
  return problems.slice(0, n).map((problem) => {
    const answer = answers.get(chunkKey(problem));
    if (!answer) throw new Error(`解答解説が見つかりません: ${problem.topic} ${problem.setLabel}`);
    return { title: `${problem.topic} ${problem.setLabel}`, problem, answer };
  });
}

async function slicePdf(src: PDFDocument, chunk: PdfChunk): Promise<Buffer> {
  const out = await PDFDocument.create();
  const indexes = Array.from(
    { length: chunk.endPage - chunk.startPage + 1 },
    (_, i) => chunk.startPage - 1 + i,
  );
  const pages = await out.copyPages(src, indexes);
  for (const page of pages) out.addPage(page);
  return Buffer.from(await out.save());
}

function fileNameFor(unit: UnitSource, kind: FileKind): string {
  const suffix = kind === "assignment" ? "問題" : "解答解説";
  return `${unit.title} ${suffix}.pdf`;
}

async function upsertMaterial(organizationId: string, config: TrialConfig) {
  const values = {
    division: "secondary" as const,
    subject: config.subject,
    name: config.name,
    description: config.description,
    progressType: "chapter" as const,
    completionAction: "delete" as const,
    sortOrder: config.sortOrder,
  };
  let [m] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, organizationId), eq(materials.name, config.name)))
    .limit(1);
  if (!m) {
    [m] = await db.insert(materials).values({ organizationId, ...values }).returning();
    console.log(`+ 教材を作成: ${m.id}`);
  } else {
    [m] = await db.update(materials).set(values).where(eq(materials.id, m.id)).returning();
    console.log(`~ 既存教材を更新: ${m.id}`);
  }
  return m;
}

async function replaceUnitsAndFiles(
  organizationId: string,
  materialId: string,
  config: TrialConfig,
  srcDoc: PDFDocument,
  unitSources: UnitSource[],
) {
  await db.delete(materialFiles).where(eq(materialFiles.materialId, materialId));
  await db.delete(units).where(eq(units.materialId, materialId));

  for (let i = 0; i < unitSources.length; i++) {
    const source = unitSources[i];
    const [u] = await db
      .insert(units)
      .values({ organizationId, materialId, sortOrder: i, title: source.title, rangeText: source.title })
      .returning({ id: units.id });

    for (const [kind, chunk] of [
      ["assignment", source.problem],
      ["answer_key", source.answer],
    ] as const) {
      const buf = await slicePdf(srcDoc, chunk);
      const pathname = `${organizationId}/materials/${materialId}/${config.purchaseId}-${String(i + 1).padStart(3, "0")}-${kind}.pdf`;
      const stored = await saveFile(pathname, buf, "application/pdf");
      await db.insert(materialFiles).values({
        organizationId,
        materialId,
        unitId: u.id,
        kind,
        blobUrl: stored.blobUrl,
        pathname: stored.pathname,
        dataB64: stored.dataB64,
        fileName: fileNameFor(source, kind),
        contentType: "application/pdf",
        size: buf.length,
      });
    }
    console.log(`  範囲 ${i + 1}/${unitSources.length}: ${source.title}`);
  }
}

async function repairEmptyAssignments(materialId: string, firstRange: string) {
  const updated = await db
    .update(assignments)
    .set({ rangeText: firstRange, progressIndex: 0, pointer: 1, unitsPerSession: 1 })
    .where(and(eq(assignments.materialId, materialId), eq(assignments.rangeText, "")))
    .returning({ id: assignments.id });
  if (updated.length === 0) return 0;
  await db
    .update(submissions)
    .set({ rangeText: firstRange })
    .where(and(inArray(submissions.assignmentId, updated.map((a) => a.id)), eq(submissions.rangeText, "")));
  return updated.length;
}

function selectedConfigs(): TrialConfig[] {
  const target = process.env.TRIAL_TARGET ?? "math-1a";
  if (target === "all") return TRIAL_CONFIGS;
  const config = TRIAL_CONFIGS.find((c) => c.target === target || c.purchaseId === target || c.trialOf === target);
  if (!config) {
    throw new Error(`未知の TRIAL_TARGET: ${target} (候補: ${TRIAL_CONFIGS.map((c) => c.target).join(", ")}, all)`);
  }
  return [config];
}

async function main() {
  const configs = selectedConfigs();
  for (const config of configs) {
    if (!existsSync(config.pdfPath)) throw new Error(`${config.name}: PDFが見つかりません: ${config.pdfPath}`);
  }
  if (!DRY && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("お試し教材の本登録には BLOB_READ_WRITE_TOKEN が必要です(PDF実体はNeonに入れずBlobへ)。");
  }

  const org = await resolveOrg();
  console.log(`組織: ${org.name} (${org.id})${DRY ? "  [DRY RUN]" : ""}`);
  console.log(`保存先: ${process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "ローカル ./.uploads (DRY のみ)"}`);

  for (const config of configs) {
    const srcBytes = readFileSync(config.pdfPath);
    const srcDoc = await PDFDocument.load(srcBytes);
    const chunks = await parseChunks(config.pdfPath);
    const unitSources = buildTrialUnits(chunks, TRIAL_UNIT_COUNT);

    console.log(`\nPDF : ${config.pdfPath} (${(srcBytes.length / 1024 / 1024).toFixed(1)}MB / ${srcDoc.getPageCount()} pages)`);
    console.log(`教材: [${config.subject}] ${config.name} / division=secondary / progress=chapter / purchase=${config.purchaseId}(trialOf=${config.trialOf})`);
    console.log(`お試し ${unitSources.length}課題: ${unitSources.map((u) => u.title).join(" / ")}`);

    if (DRY) continue;

    const material = await upsertMaterial(org.id, config);
    await replaceUnitsAndFiles(org.id, material.id, config, srcDoc, unitSources);
    const repaired = await repairEmptyAssignments(material.id, unitSources[0].title);

    const unitRows = await db
      .select({ title: units.title })
      .from(units)
      .where(eq(units.materialId, material.id))
      .orderBy(asc(units.sortOrder));
    console.log(`✓ ${config.name} 登録完了: ${unitRows.length}課題 / 問題+解答PDF / 既存空割当の補正 ${repaired}件`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
