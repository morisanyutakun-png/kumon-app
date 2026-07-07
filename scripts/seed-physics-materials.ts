/**
 * 物理3教材(入門/標準/発展)を中高部教材として登録する(冪等)。
 *
 * ルートのPDFから「演習 n」と「【解答】演習 n」を検出し、
 *   - 1演習 = 1範囲(unit)
 *   - 問題PDF = material_files.kind "assignment"
 *   - 解答解説PDF = material_files.kind "answer_key"
 * として分割登録する。
 *
 * 実行:
 *   set -a; . ./.env; [ -f .env.local ] && . ./.env.local; set +a; npm run materials:seed-physics
 *
 * 確認のみ(書き込まない): DRY_RUN=1 を付ける。
 * 本登録には BLOB_READ_WRITE_TOKEN が必要。未設定だとDB容量を圧迫するため停止する。
 * 組織は既定で「1つだけならそれ」。複数なら ORG_ID か ORG_NAME を指定。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument, type PDFPage } from "pdf-lib";

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
const SPLIT_THRESHOLD_FROM_TOP = 160;
const HEADER_MARGIN = 8;
const MAX_DB_TEXT = 255;

const MATERIAL_CONFIGS = [
  {
    name: "物理入門演習",
    pdfPath: process.env.PHYSICS_BASIC_PDF ?? `${ROOT}/物理入門演習.pdf`,
    purchaseId: "physics-basic",
    sortOrder: 610,
    expectedCount: 89,
    description: "物理 入門演習。1演習ごとに問題PDFと解答解説PDFを分離。購入(physics-basic)で自動割り当て。",
  },
  {
    name: "物理標準演習",
    pdfPath: process.env.PHYSICS_STANDARD_PDF ?? `${ROOT}/物理標準演習.pdf`,
    purchaseId: "physics",
    sortOrder: 611,
    expectedCount: 85,
    description: "物理 標準演習。1演習ごとに問題PDFと解答解説PDFを分離。購入(physics)で自動割り当て。",
  },
  {
    name: "物理発展演習",
    pdfPath: process.env.PHYSICS_ADVANCED_PDF ?? `${ROOT}/物理発展演習のコピー.pdf`,
    purchaseId: "physics-advanced",
    sortOrder: 612,
    expectedCount: 77,
    description: "物理 発展演習。1演習ごとに問題PDFと解答解説PDFを分離。購入(physics-advanced)で自動割り当て。",
  },
] as const;

type MaterialConfig = (typeof MATERIAL_CONFIGS)[number];

interface Marker {
  no: number;
  page: number; // 1-based
  title: string;
}

interface PageSegment {
  page: number; // 1-based
  /** Visual coordinates from the top of the page. */
  cropFromTop?: { top: number; bottom: number };
}

interface ExerciseSource {
  no: number;
  title: string;
  problemSegments: PageSegment[];
  answerSegments: PageSegment[];
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

function answerHeaderTop(pdfPath: string, page: number): number | null {
  const xml = execFileSync("pdftotext", ["-bbox", "-f", String(page), "-l", String(page), pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const m = xml.match(/<word\b[^>]*\byMin="([\d.]+)"[^>]*>【解答】演習<\/word>/);
  return m ? Number(m[1]) : null;
}

function stripDifficulty(s: string): string {
  return s
    .replace(/難易度:.*/, "")
    .replace(/\s*(基礎|共テ|二次|共通テスト|地方国公立|旧帝大|難関大)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromExerciseText(text: string, no: number): string {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => new RegExp(`^\\s*演習\\s*${no}\\b`).test(line));
  if (idx < 0) return "";

  const parts: string[] = [];
  const first = lines[idx].replace(new RegExp(`^\\s*演習\\s*${no}\\s*`), "");
  const firstClean = stripDifficulty(first);
  if (firstClean) parts.push(firstClean);

  for (let i = idx + 1; i < Math.min(lines.length, idx + 5); i++) {
    const raw = lines[i].trim();
    if (!raw && parts.length > 0) break;
    const clean = stripDifficulty(raw);
    if (clean) parts.push(clean);
  }

  return parts.join("").trim();
}

function titleFromAnswerText(text: string, no: number): string {
  const compact = text.replace(/\r?\n/g, " ");
  const m = compact.match(new RegExp(`【解答】演習\\s*${no}\\s*[：:]\\s*(.+?)(?:\\s{2,}|方針|\\(1\\)|$)`));
  return m ? stripDifficulty(m[1]) : "";
}

function findExerciseStart(text: string, page: number): Marker | null {
  const m = text.match(/^\s*演習\s*(\d+)\b/m);
  if (!m) return null;
  const no = Number(m[1]);
  return { no, page, title: titleFromExerciseText(text, no) };
}

function findAnswerStart(text: string, page: number): Marker | null {
  const m = text.match(/【解答】演習\s*(\d+)/);
  if (!m) return null;
  const no = Number(m[1]);
  return { no, page, title: titleFromAnswerText(text, no) };
}

async function parseExercises(config: MaterialConfig): Promise<ExerciseSource[]> {
  const doc = await PDFDocument.load(readFileSync(config.pdfPath));
  const starts: Marker[] = [];
  const answers: Marker[] = [];

  for (let page = 1; page <= doc.getPageCount(); page++) {
    const text = pageText(config.pdfPath, page);
    const start = findExerciseStart(text, page);
    if (start) starts.push(start);
    const answer = findAnswerStart(text, page);
    if (answer) answers.push(answer);
  }

  if (starts.length !== config.expectedCount || answers.length !== config.expectedCount) {
    throw new Error(
      `${config.name}: 検出数が想定外です start=${starts.length}, answer=${answers.length}, expected=${config.expectedCount}`,
    );
  }

  const answerByNo = new Map(answers.map((a) => [a.no, a]));
  return starts.map((start, idx) => {
    const answer = answerByNo.get(start.no);
    if (!answer) throw new Error(`${config.name}: 演習${start.no}の解答開始が見つかりません`);

    const nextStartPage = starts[idx + 1]?.page ?? doc.getPageCount() + 1;
    if (answer.page >= nextStartPage) {
      throw new Error(`${config.name}: 演習${start.no}のページ順が不正です`);
    }

    const title = answer.title || start.title || `演習 ${start.no}`;
    const headerTop = answerHeaderTop(config.pdfPath, answer.page);
    const splitTop =
      headerTop && headerTop > SPLIT_THRESHOLD_FROM_TOP
        ? Math.max(0, headerTop - HEADER_MARGIN)
        : null;

    const problemSegments: PageSegment[] = [];
    for (let page = start.page; page < answer.page; page++) {
      problemSegments.push({ page });
    }
    if (splitTop !== null) {
      problemSegments.push({ page: answer.page, cropFromTop: { top: 0, bottom: splitTop } });
    }

    const answerSegments: PageSegment[] = [
      splitTop !== null
        ? { page: answer.page, cropFromTop: { top: splitTop, bottom: doc.getPage(answer.page - 1).getHeight() } }
        : { page: answer.page },
    ];
    for (let page = answer.page + 1; page < nextStartPage; page++) {
      answerSegments.push({ page });
    }

    return {
      no: start.no,
      title: truncateText(`演習 ${start.no} ${title}`, MAX_DB_TEXT),
      problemSegments,
      answerSegments,
    };
  });
}

function applyCrop(page: PDFPage, segment: PageSegment) {
  if (!segment.cropFromTop) return;
  const { width, height } = page.getSize();
  const top = Math.max(0, Math.min(height, segment.cropFromTop.top));
  const bottom = Math.max(top + 1, Math.min(height, segment.cropFromTop.bottom));
  const y = height - bottom;
  const h = bottom - top;
  page.setMediaBox(0, y, width, h);
  page.setCropBox(0, y, width, h);
}

async function sliceSegments(src: PDFDocument, segments: PageSegment[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const segment of segments) {
    const [page] = await out.copyPages(src, [segment.page - 1]);
    applyCrop(page, segment);
    out.addPage(page);
  }
  return Buffer.from(await out.save());
}

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

function truncateText(s: string, maxChars: number): string {
  const normalized = s.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxChars) return normalized;
  return `${chars.slice(0, Math.max(0, maxChars - 3)).join("").trim()}...`;
}

function materialFileName(title: string, suffix: string): string {
  const suffixText = ` ${suffix}.pdf`;
  return `${truncateText(safeFileName(title), MAX_DB_TEXT - suffixText.length)}${suffixText}`;
}

async function upsertMaterial(organizationId: string, config: MaterialConfig) {
  let [m] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, organizationId), eq(materials.name, config.name)))
    .limit(1);

  const values = {
    organizationId,
    division: "secondary" as const,
    subject: "物理",
    name: config.name,
    description: config.description,
    progressType: "chapter" as const,
    completionAction: "delete" as const,
    sortOrder: config.sortOrder,
  };

  if (!m) {
    [m] = await db.insert(materials).values(values).returning();
    console.log(`+ 教材を作成: ${config.name} (${m.id})`);
  } else {
    [m] = await db.update(materials).set(values).where(eq(materials.id, m.id)).returning();
    console.log(`~ 既存教材を更新: ${config.name} (${m.id})`);
  }
  return m;
}

async function replaceUnitsAndFiles(
  organizationId: string,
  materialId: string,
  config: MaterialConfig,
  exercises: ExerciseSource[],
) {
  const srcDoc = await PDFDocument.load(readFileSync(config.pdfPath));
  await db.delete(materialFiles).where(eq(materialFiles.materialId, materialId));
  await db.delete(units).where(eq(units.materialId, materialId));

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const [u] = await db
      .insert(units)
      .values({
        organizationId,
        materialId,
        sortOrder: i,
        title: ex.title,
        rangeText: ex.title,
      })
      .returning({ id: units.id });

    for (const [kind, segments, suffix] of [
      ["assignment", ex.problemSegments, "問題"],
      ["answer_key", ex.answerSegments, "解答解説"],
    ] as const) {
      const buf = await sliceSegments(srcDoc, segments);
      const pathname = `${organizationId}/materials/${materialId}/${config.purchaseId}-${String(ex.no).padStart(3, "0")}-${kind}.pdf`;
      const stored = await saveFile(pathname, buf, "application/pdf");
      await db.insert(materialFiles).values({
        organizationId,
        materialId,
        unitId: u.id,
        kind,
        blobUrl: stored.blobUrl,
        pathname: stored.pathname,
        dataB64: stored.dataB64,
        fileName: materialFileName(ex.title, suffix),
        contentType: "application/pdf",
        size: buf.length,
      });
    }

    if ((i + 1) % 20 === 0 || i + 1 === exercises.length) {
      console.log(`  ${config.name}: ${i + 1}/${exercises.length} 演習`);
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

async function main() {
  for (const config of MATERIAL_CONFIGS) {
    if (!existsSync(config.pdfPath)) throw new Error(`${config.name}: PDFが見つかりません: ${config.pdfPath}`);
  }

  if (!DRY && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("物理PDFの本登録には BLOB_READ_WRITE_TOKEN が必要です。.env に設定してから再実行してください。");
  }

  const org = await resolveOrg();
  console.log(`組織: ${org.name} (${org.id})${DRY ? "  [DRY RUN]" : ""}`);
  console.log(`保存先: ${process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "DB base64 fallback (BLOB_READ_WRITE_TOKEN 未設定)"}`);

  for (const config of MATERIAL_CONFIGS) {
    const src = await PDFDocument.load(readFileSync(config.pdfPath));
    const exercises = await parseExercises(config);
    console.log(
      `\n${config.name}: ${exercises.length}演習 / ${src.getPageCount()} pages / ${config.pdfPath}`,
    );
    console.log(`  範囲: ${exercises[0].title} 〜 ${exercises.at(-1)?.title}`);

    if (DRY) continue;

    const material = await upsertMaterial(org.id, config);
    await replaceUnitsAndFiles(org.id, material.id, config, exercises);
    const repaired = await repairEmptyAssignments(material.id, exercises[0].title);
    const unitRows = await db
      .select({ title: units.title })
      .from(units)
      .where(eq(units.materialId, material.id))
      .orderBy(asc(units.sortOrder));
    console.log(`✓ ${config.name} 登録完了: ${unitRows.length}範囲 / 既存空割当の補正 ${repaired}件`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
