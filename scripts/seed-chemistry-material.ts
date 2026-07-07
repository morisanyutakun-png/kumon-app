/**
 * 化学(総集編)を中高部教材として登録する(冪等)。
 *
 * ルートの PDF を解析し、既存の数学/英語教材と同じように
 *   - 1セット = 1範囲(unit)
 *   - 問題PDF = material_files.kind "assignment"
 *   - 解答解説PDF = material_files.kind "answer_key"
 * として分割登録する。
 *
 * 実行:
 *   set -a && . ./.env && set +a && npm run materials:seed-chemistry
 *
 * 確認のみ(書き込まない): DRY_RUN=1 を付ける。
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
const DEFAULT_SET_LABELS = ["A-1", "A-2", "A-3", "B-1", "B-2", "B-3", "C-1", "C-2", "C-3"];

const CHEMISTRY_TOPICS = [
  "気体と物質の状態",
  "溶液",
  "結晶",
  "反応エンタルピー",
  "電池と電気分解",
  "反応速度と平衡",
  "非金属元素",
  "金属元素と金属イオン",
  "脂肪族化合物",
  "芳香族化合物",
  "天然高分子",
  "合成高分子",
] as const;

const CHEMISTRY_BASIC_TOPICS = [
  "物質の構成と三態",
  "原子の構造",
  "周期表と周期律",
  "化学結合",
  "結晶",
  "物質量と濃度",
  "化学反応式と量的関係",
  "酸と塩基",
  "中和反応と塩",
  "酸化還元",
] as const;

interface MaterialConfig {
  target: string;
  name: string;
  pdfPath: string;
  purchaseId: string;
  subject: string;
  sortOrder: number;
  expectedTopics: readonly string[];
  setLabels: readonly string[];
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

const MATERIAL_CONFIGS: MaterialConfig[] = [
  {
    target: "chemistry",
    name: process.env.CHEM_NAME ?? "化学 総集編",
    pdfPath: rootPdf("化学_総集編のコピー.pdf", process.env.CHEM_PDF),
    purchaseId: "chemistry",
    subject: "化学",
    sortOrder: 620,
    expectedTopics: CHEMISTRY_TOPICS,
    setLabels: DEFAULT_SET_LABELS,
    description:
      "化学 類題プリント 総集編(全12分野 x A/B/C x 1〜3)。問題PDFと解答解説PDFを範囲ごとに分離。購入(chemistry)で自動割り当て。",
  },
  {
    target: "chemistry-basic",
    name: process.env.CHEM_BASIC_NAME ?? "化学基礎 標準",
    pdfPath: rootPdf("化学基礎_総集編のコピー.pdf", process.env.CHEM_BASIC_PDF),
    purchaseId: "chemistry-basic",
    subject: "化学",
    sortOrder: 619,
    expectedTopics: CHEMISTRY_BASIC_TOPICS,
    setLabels: DEFAULT_SET_LABELS,
    description:
      "化学基礎 類題プリント 総集編(全10分野 x A/B/C x 1〜3)。問題PDFと解答解説PDFを範囲ごとに分離。購入(chemistry-basic)で自動割り当て。",
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
  topic: string;
  setLabel: string;
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

function buildUnitSources(chunks: PdfChunk[], config: MaterialConfig): UnitSource[] {
  const problems = chunks.filter((c) => c.kind === "assignment");
  const answers = new Map(chunks.filter((c) => c.kind === "answer_key").map((c) => [chunkKey(c), c]));
  const rows = problems.map((problem) => {
    const answer = answers.get(chunkKey(problem));
    if (!answer) throw new Error(`解答解説が見つかりません: ${problem.topic} ${problem.setLabel}`);
    return {
      title: `${problem.topic} ${problem.setLabel}`,
      topic: problem.topic,
      setLabel: problem.setLabel,
      problem,
      answer,
    };
  });

  const missingTopics = config.expectedTopics.filter((topic) => !rows.some((r) => r.topic === topic));
  if (missingTopics.length > 0) throw new Error(`PDFから分野を検出できません: ${missingTopics.join(", ")}`);
  const expectedUnitCount = config.expectedTopics.length * config.setLabels.length;
  if (rows.length !== expectedUnitCount) {
    throw new Error(`検出した範囲数が想定外です: ${rows.length}件 (想定 ${expectedUnitCount}件)`);
  }
  return rows;
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

async function upsertMaterial(organizationId: string, config: MaterialConfig) {
  let [m] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, organizationId), eq(materials.name, config.name)))
    .limit(1);

  if (!m) {
    [m] = await db
      .insert(materials)
      .values({
        organizationId,
        division: "secondary",
        subject: config.subject,
        name: config.name,
        description: config.description,
        progressType: "chapter",
        completionAction: "delete",
        sortOrder: config.sortOrder,
      })
      .returning();
    console.log(`+ 教材を作成: ${m.id}`);
  } else {
    [m] = await db
      .update(materials)
      .set({
        division: "secondary",
        subject: config.subject,
        description: config.description,
        progressType: "chapter",
        completionAction: "delete",
        sortOrder: config.sortOrder,
      })
      .where(eq(materials.id, m.id))
      .returning();
    console.log(`~ 既存教材を更新: ${m.id}`);
  }
  return m;
}

async function replaceUnits(organizationId: string, materialId: string, unitSources: UnitSource[]) {
  await db.delete(materialFiles).where(eq(materialFiles.materialId, materialId));
  await db.delete(units).where(eq(units.materialId, materialId));

  const created: Array<{ id: string; title: string; source: UnitSource }> = [];
  for (let i = 0; i < unitSources.length; i++) {
    const source = unitSources[i];
    const [u] = await db
      .insert(units)
      .values({
        organizationId,
        materialId,
        sortOrder: i,
        title: source.title,
        rangeText: source.title,
      })
      .returning({ id: units.id });
    created.push({ id: u.id, title: source.title, source });
  }
  return created;
}

async function replaceFiles(
  organizationId: string,
  materialId: string,
  config: MaterialConfig,
  srcDoc: PDFDocument,
  createdUnits: Awaited<ReturnType<typeof replaceUnits>>,
) {
  for (let i = 0; i < createdUnits.length; i++) {
    const row = createdUnits[i];
    for (const [kind, chunk] of [
      ["assignment", row.source.problem],
      ["answer_key", row.source.answer],
    ] as const) {
      const buf = await slicePdf(srcDoc, chunk);
      const pathname = `${organizationId}/materials/${materialId}/${config.purchaseId}-${String(i + 1).padStart(3, "0")}-${kind}.pdf`;
      const stored = await saveFile(pathname, buf, "application/pdf");
      await db.insert(materialFiles).values({
        organizationId,
        materialId,
        unitId: row.id,
        kind,
        blobUrl: stored.blobUrl,
        pathname: stored.pathname,
        dataB64: stored.dataB64,
        fileName: fileNameFor(row.source, kind),
        contentType: "application/pdf",
        size: buf.length,
      });
    }
    if ((i + 1) % 12 === 0 || i + 1 === createdUnits.length) {
      console.log(`  files: ${i + 1}/${createdUnits.length} 範囲`);
    }
  }
}

async function repairEmptyAssignments(materialId: string, firstRange: string) {
  const updatedAssignments = await db
    .update(assignments)
    .set({ rangeText: firstRange, progressIndex: 0, pointer: 1, unitsPerSession: 1 })
    .where(and(eq(assignments.materialId, materialId), eq(assignments.rangeText, "")))
    .returning({ id: assignments.id });

  if (updatedAssignments.length === 0) return 0;

  await db
    .update(submissions)
    .set({ rangeText: firstRange })
    .where(and(inArray(submissions.assignmentId, updatedAssignments.map((a) => a.id)), eq(submissions.rangeText, "")));

  return updatedAssignments.length;
}

function selectedConfigs(): MaterialConfig[] {
  const target = process.env.CHEM_TARGET ?? process.env.CHEM_VARIANT ?? "chemistry";
  if (target === "all") return MATERIAL_CONFIGS;
  const config = MATERIAL_CONFIGS.find((c) => c.target === target || c.purchaseId === target);
  if (!config) {
    throw new Error(`未知のCHEM_TARGETです: ${target} (候補: ${MATERIAL_CONFIGS.map((c) => c.target).join(", ")}, all)`);
  }
  return [config];
}

async function main() {
  const configs = selectedConfigs();
  for (const config of configs) {
    if (!existsSync(config.pdfPath)) throw new Error(`${config.name}: PDFが見つかりません: ${config.pdfPath}`);
  }

  if (!DRY && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("化学PDFの本登録には BLOB_READ_WRITE_TOKEN が必要です。PDF本体をNeonに入れないため、Blobトークンを設定して再実行してください。");
  }

  const org = await resolveOrg();

  console.log(`組織: ${org.name} (${org.id})${DRY ? "  [DRY RUN]" : ""}`);
  console.log(`保存先: ${process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "DB base64 fallback (DRY RUNのみ)"}`);

  for (const config of configs) {
    const srcBytes = readFileSync(config.pdfPath);
    const srcDoc = await PDFDocument.load(srcBytes);
    const chunks = await parseChunks(config.pdfPath);
    const unitSources = buildUnitSources(chunks, config);

    console.log(`\nPDF : ${config.pdfPath} (${(srcBytes.length / 1024 / 1024).toFixed(1)}MB / ${srcDoc.getPageCount()} pages)`);
    console.log(`教材: [${config.subject}] ${config.name} / division=secondary / progress=chapter / purchase=${config.purchaseId}`);
    console.log(`範囲: ${unitSources.length}件 (${unitSources[0].title} 〜 ${unitSources.at(-1)?.title})`);

    if (DRY) continue;

    const material = await upsertMaterial(org.id, config);
    const createdUnits = await replaceUnits(org.id, material.id, unitSources);
    await replaceFiles(org.id, material.id, config, srcDoc, createdUnits);
    const repaired = await repairEmptyAssignments(material.id, createdUnits[0].title);

    const unitRows = await db
      .select({ title: units.title })
      .from(units)
      .where(eq(units.materialId, material.id))
      .orderBy(asc(units.sortOrder));
    console.log(`✓ ${config.name} 登録完了: ${unitRows.length}範囲 / 問題+解答PDF / 既存空割当の補正 ${repaired}件`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
