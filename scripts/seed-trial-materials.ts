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
 * PDFの課題見出しは2形式:
 *   - "set"      … 化学/数学IA/数学IIBC/英語長文 総集編: 「… 標準／<分野> … セット A-1」
 *   - "exercise" … 物理標準演習: 「演習 1」/「【解答】演習 1」(解答が問題と同ページに続く場合はページを上下分割)
 *
 * 実行:
 *   set -a && . ./.env && set +a && npm run materials:seed-trial            # 既定 math-1a
 *   TRIAL_TARGET=physics npm run materials:seed-trial                        # 他科目
 *   TRIAL_TARGET=all npm run materials:seed-trial                            # 全お試し
 * 確認のみ(書き込まない): DRY_RUN=1 を付ける。
 * 本登録には BLOB_READ_WRITE_TOKEN が必要(PDF実体はNeonに入れずBlobへ)。
 * 組織は既定で「1つだけならそれ」。複数なら ORG_ID か ORG_NAME を指定。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const TRIAL_UNIT_COUNT = Number(process.env.TRIAL_COUNT ?? 3); // お試しは先頭3課題

// 物理: 解答が問題と同ページに続く場合の分割しきい値(ページ上端からの視覚座標)。
const SPLIT_THRESHOLD_FROM_TOP = 160;
const HEADER_MARGIN = 8;

type MarkerStyle = "set" | "exercise";

interface TrialConfig {
  target: string; // TRIAL_TARGET で選ぶキー
  purchaseId: string; // yuta-eng のお試し購入ID(例 math-1a-trial)。pathname に使用
  trialOf: string; // 対応するフル科目ID(例 math-1a)
  name: string; // 教材名(「お試し」を必ず含める=subject-map の nameIncludes)
  subject: string; // materials.subject(subject-map の subjects と一致させる)
  pdfPath: string;
  sortOrder: number;
  markerStyle: MarkerStyle;
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
    markerStyle: "set",
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
    markerStyle: "set",
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
    markerStyle: "set",
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
    markerStyle: "set",
    description:
      "化学標準 お試し(先頭3課題)。添削3回ぶんを実際の教材で体験できます。本契約で全範囲に進めます。購入(chemistry-trial)で自動割り当て。",
  },
  {
    target: "physics",
    purchaseId: "physics-trial",
    trialOf: "physics",
    name: "物理標準 お試し",
    subject: "物理",
    pdfPath: rootPdf("物理標準演習.pdf", process.env.PHYSICS_STANDARD_PDF),
    sortOrder: 594,
    markerStyle: "exercise",
    description:
      "物理標準 お試し(先頭3課題)。添削3回ぶんを実際の教材で体験できます。本契約で全範囲に進めます。購入(physics-trial)で自動割り当て。",
  },
];

type FileKind = "assignment" | "answer_key";

/** ページ範囲/切り抜き。cropFromTop があればページを上下に切る(物理の解答分割用)。 */
interface PageSegment {
  page: number; // 1-based
  cropFromTop?: { top: number; bottom: number };
}

interface UnitSource {
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

// ---------------------------------------------------------------------------
// セット式(化学/数学/英語 総集編)
// ---------------------------------------------------------------------------
interface SetChunk {
  kind: FileKind;
  topic: string;
  setLabel: string;
  startPage: number;
  endPage: number;
}

function markerFromText(text: string): Omit<SetChunk, "startPage" | "endPage"> | null {
  const set = text.match(/セット\s+([A-C])-(\d)/);
  if (!set) return null;
  const topic = text.match(/標準／(.+?)(?:\s+解答・解説|\s+／\s*\d+)/);
  if (!topic) return null;
  return {
    kind: text.includes("解答・解説") ? "answer_key" : "assignment",
    topic: topic[1].replace(/\s+/g, " ").trim(),
    setLabel: `${set[1]}-${set[2]}`,
  };
}

function sameSetChunk(a: SetChunk, b: Omit<SetChunk, "startPage" | "endPage">): boolean {
  return a.kind === b.kind && a.topic === b.topic && a.setLabel === b.setLabel;
}

/** 先頭 n 問題チャンクと対応する解答を対にする(全ページ走査せず、n問題+その解答が揃ったら止める)。 */
function parseSetTrial(pdfPath: string, pageCount: number, n: number): UnitSource[] {
  const chunks: SetChunk[] = [];
  let current: SetChunk | null = null;
  const key = (c: Pick<SetChunk, "topic" | "setLabel">) => `${c.topic}::${c.setLabel}`;

  const haveEnough = () => {
    const problems = chunks.filter((c) => c.kind === "assignment").slice(0, n);
    if (problems.length < n) return false;
    const answers = new Set(chunks.filter((c) => c.kind === "answer_key").map(key));
    return problems.every((p) => answers.has(key(p)));
  };

  for (let page = 1; page <= pageCount; page++) {
    const marker = markerFromText(pageText(pdfPath, page));
    if (marker) {
      if (current && sameSetChunk(current, marker)) {
        current.endPage = page;
      } else {
        if (current) chunks.push(current);
        current = { ...marker, startPage: page, endPage: page };
      }
    }
    // current を push する前に haveEnough は current 未確定なので、確定済みチャンクで判定
    if (current && haveEnough()) break;
  }
  if (current) chunks.push(current);

  const problems = chunks.filter((c) => c.kind === "assignment").slice(0, n);
  const answers = new Map(chunks.filter((c) => c.kind === "answer_key").map((c) => [key(c), c]));
  if (problems.length < n) {
    throw new Error(`問題が ${n} 課題に満たない(検出 ${problems.length}件)。セットマーカー検出を確認してください。`);
  }
  return problems.map((p) => {
    const a = answers.get(key(p));
    if (!a) throw new Error(`解答解説が見つかりません: ${p.topic} ${p.setLabel}`);
    const pages = (c: SetChunk): PageSegment[] =>
      Array.from({ length: c.endPage - c.startPage + 1 }, (_, i) => ({ page: c.startPage + i }));
    return { title: `${p.topic} ${p.setLabel}`, problemSegments: pages(p), answerSegments: pages(a) };
  });
}

// ---------------------------------------------------------------------------
// 演習式(物理標準演習): 「演習 n」/「【解答】演習 n」。解答が同ページに続く場合は上下分割。
// ---------------------------------------------------------------------------
function answerHeaderTop(pdfPath: string, page: number): number | null {
  const xml = execFileSync("pdftotext", ["-bbox", "-f", String(page), "-l", String(page), pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const m = xml.match(/<word\b[^>]*\byMin="([\d.]+)"[^>]*>【解答】演習<\/word>/);
  return m ? Number(m[1]) : null;
}

interface Marker { no: number; page: number }

/** 先頭 n 演習を切り出す。演習 n の解答終端を確定するため n+1 個目の演習開始まで走査する。 */
async function parseExerciseTrial(doc: PDFDocument, pdfPath: string, n: number): Promise<UnitSource[]> {
  const starts: Marker[] = [];
  const answers = new Map<number, number>(); // 演習no → answer開始ページ
  const total = doc.getPageCount();

  for (let page = 1; page <= total; page++) {
    const text = pageText(pdfPath, page);
    const s = text.match(/^\s*演習\s*(\d+)\b/m);
    if (s) starts.push({ no: Number(s[1]), page });
    const a = text.match(/【解答】演習\s*(\d+)/);
    if (a) answers.set(Number(a[1]), page);
    if (starts.length >= n + 1) break; // n 個目の範囲確定に n+1 個目の開始が要る
  }
  if (starts.length < n) {
    throw new Error(`演習が ${n} 件に満たない(検出 ${starts.length}件)。演習マーカー検出を確認してください。`);
  }

  const units: UnitSource[] = [];
  for (let i = 0; i < n; i++) {
    const start = starts[i];
    const answerPage = answers.get(start.no);
    if (!answerPage) throw new Error(`演習${start.no}の解答開始が見つかりません`);
    const nextStartPage = starts[i + 1]?.page ?? total + 1;

    const headerTop = answerHeaderTop(pdfPath, answerPage);
    const splitTop =
      headerTop && headerTop > SPLIT_THRESHOLD_FROM_TOP ? Math.max(0, headerTop - HEADER_MARGIN) : null;

    const problemSegments: PageSegment[] = [];
    for (let page = start.page; page < answerPage; page++) problemSegments.push({ page });
    if (splitTop !== null) problemSegments.push({ page: answerPage, cropFromTop: { top: 0, bottom: splitTop } });

    const answerSegments: PageSegment[] = [
      splitTop !== null
        ? { page: answerPage, cropFromTop: { top: splitTop, bottom: doc.getPage(answerPage - 1).getHeight() } }
        : { page: answerPage },
    ];
    for (let page = answerPage + 1; page < nextStartPage; page++) answerSegments.push({ page });

    units.push({ title: `演習 ${start.no}`, problemSegments, answerSegments });
  }
  return units;
}

// ---------------------------------------------------------------------------
// 共通: セグメント → PDF
// ---------------------------------------------------------------------------
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

function fileNameFor(title: string, kind: FileKind): string {
  return `${title} ${kind === "assignment" ? "問題" : "解答解説"}.pdf`;
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

    for (const [kind, segments] of [
      ["assignment", source.problemSegments],
      ["answer_key", source.answerSegments],
    ] as const) {
      const buf = await sliceSegments(srcDoc, segments);
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
        fileName: fileNameFor(source.title, kind),
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
    const unitSources =
      config.markerStyle === "exercise"
        ? await parseExerciseTrial(srcDoc, config.pdfPath, TRIAL_UNIT_COUNT)
        : parseSetTrial(config.pdfPath, srcDoc.getPageCount(), TRIAL_UNIT_COUNT);

    console.log(`\nPDF : ${config.pdfPath} (${(srcBytes.length / 1024 / 1024).toFixed(1)}MB / ${srcDoc.getPageCount()} pages)`);
    console.log(`教材: [${config.subject}] ${config.name} / division=secondary / progress=chapter / purchase=${config.purchaseId}(trialOf=${config.trialOf}) / marker=${config.markerStyle}`);
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
