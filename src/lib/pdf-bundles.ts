import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { db } from "@/db";
import {
  assignments,
  materialCompleteFiles,
  materialFiles,
  materials,
  submissionImages,
  submissions,
  students,
  units,
} from "@/db/schema";
import { readStored, saveBlob } from "@/lib/blob";
import { getSubmissionDetail } from "@/lib/queries";

function safeFileStem(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "material";
}

async function appendPdf(target: PDFDocument, body: Buffer | Uint8Array): Promise<number> {
  const src = await PDFDocument.load(body);
  const pages = await target.copyPages(src, src.getPageIndices());
  for (const page of pages) target.addPage(page);
  return pages.length;
}

function isPdfFile(row: { contentType: string; fileName: string }) {
  return row.contentType === "application/pdf" || row.fileName.toLowerCase().endsWith(".pdf");
}

function ascii(s: string, fallback = "Untitled"): string {
  const out = s.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  return out || fallback;
}

async function addDividerPage(
  pdf: PDFDocument,
  args: {
    index: number;
    total: number;
    studentName: string;
    materialName: string;
    subject: string;
    rangeText: string;
    sessionNo: number;
    submissionId: string;
    kind: "answers" | "solutions";
    note?: string;
  },
) {
  const page = pdf.addPage([595.28, 841.89]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const title = args.kind === "answers" ? "Submitted Answer" : "Answer Key";
  const accent = args.kind === "answers" ? rgb(0.06, 0.45, 0.72) : rgb(0.05, 0.55, 0.34);

  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.96, 0.98, 1) });
  page.drawRectangle({ x: 0, y: 0, width: 24, height: 841.89, color: accent });
  page.drawText(`${title} ${args.index} / ${args.total}`, { x: 64, y: 715, size: 28, font: bold, color: rgb(0.08, 0.16, 0.27) });
  page.drawText("This divider is inserted so batch marking can be split back into each submission.", {
    x: 64,
    y: 680,
    size: 10,
    font: regular,
    color: rgb(0.39, 0.45, 0.55),
  });

  const rows = [
    ["Student", args.studentName],
    ["Subject", args.subject],
    ["Material", args.materialName],
    ["Range", args.rangeText || "No range"],
    ["Session", String(args.sessionNo)],
    ["Submission", args.submissionId],
  ] as const;

  let y = 610;
  for (const [label, value] of rows) {
    page.drawText(`${label}:`, { x: 64, y, size: 12, font: bold, color: rgb(0.15, 0.23, 0.36) });
    page.drawText(ascii(value, "-").slice(0, 72), { x: 150, y, size: 12, font: regular, color: rgb(0.15, 0.23, 0.36) });
    y -= 28;
  }
  if (args.note) {
    page.drawText(ascii(args.note).slice(0, 96), { x: 64, y: 370, size: 12, font: bold, color: rgb(0.76, 0.29, 0.06) });
  }
}

async function appendImageFile(
  pdf: PDFDocument,
  im: { contentType: string; fileName: string },
  body: Buffer | Uint8Array,
): Promise<number> {
  const bytes = new Uint8Array(body);
  let embedded;
  try {
    embedded =
      (im.contentType || "").includes("png") || im.fileName.toLowerCase().endsWith(".png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
  } catch {
    embedded = await pdf.embedJpg(bytes);
  }
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return 1;
}

export interface StudentBundleSubmission {
  submissionId: string;
  studentId: string;
  studentName: string;
  studentGrade: string;
  materialName: string;
  subject: string;
  rangeText: string;
  sessionNo: number;
  attemptCount: number;
  startPage: number;
  endPage: number;
  pageCount: number;
}

export async function listStudentGradableSubmissions(
  organizationId: string,
  studentId: string,
) {
  return db
    .select({
      submissionId: submissions.id,
      studentId: submissions.studentId,
      studentName: students.name,
      studentGrade: students.grade,
      materialName: materials.name,
      subject: materials.subject,
      rangeText: submissions.rangeText,
      sessionNo: submissions.sessionNo,
      attemptCount: submissions.attemptCount,
      submittedAt: submissions.submittedAt,
      updatedAt: submissions.updatedAt,
    })
    .from(submissions)
    .innerJoin(students, eq(submissions.studentId, students.id))
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(materials, eq(assignments.materialId, materials.id))
    .where(
      and(
        eq(submissions.organizationId, organizationId),
        eq(submissions.studentId, studentId),
        inArray(submissions.status, ["submitted", "grading"]),
      ),
    )
    .orderBy(asc(submissions.submittedAt), asc(submissions.createdAt));
}

export async function buildStudentAnswerBundlePdf(
  organizationId: string,
  studentId: string,
): Promise<{ bytes: Uint8Array; submissions: StudentBundleSubmission[] } | null> {
  const rows = await listStudentGradableSubmissions(organizationId, studentId);
  if (rows.length === 0) return null;

  const subIds = rows.map((s) => s.submissionId);
  const imgs = await db
    .select()
    .from(submissionImages)
    .where(inArray(submissionImages.submissionId, subIds))
    .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder));

  const pdf = await PDFDocument.create();
  const metas: StudentBundleSubmission[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const all = imgs.filter((img) => img.submissionId === row.submissionId && img.organizationId === organizationId);
    const latestAttempt = all.reduce((m, img) => Math.max(m, img.attemptNo), 0);
    const latest = all.filter((img) => img.attemptNo === latestAttempt);
    if (latest.length === 0) continue;

    const startPage = pdf.getPageCount();
    await addDividerPage(pdf, { ...row, index: i + 1, total: rows.length, kind: "answers" });
    let appended = 1;

    for (const im of latest) {
      const file = await readStored(im);
      if (!file) continue;
      try {
        appended += isPdfFile(im)
          ? await appendPdf(pdf, file.body)
          : await appendImageFile(pdf, im, file.body);
      } catch {
        continue;
      }
    }

    if (appended <= 1) {
      pdf.removePage(startPage);
      continue;
    }

    const endPage = pdf.getPageCount() - 1;
    metas.push({
      submissionId: row.submissionId,
      studentId: row.studentId,
      studentName: row.studentName,
      studentGrade: row.studentGrade,
      materialName: row.materialName,
      subject: row.subject,
      rangeText: row.rangeText,
      sessionNo: row.sessionNo,
      attemptCount: row.attemptCount,
      startPage,
      endPage,
      pageCount: endPage - startPage + 1,
    });
  }

  return pdf.getPageCount() > 0 ? { bytes: await pdf.save(), submissions: metas } : null;
}

export async function buildStudentSolutionBundlePdf(
  organizationId: string,
  studentId: string,
): Promise<Uint8Array | null> {
  const rows = await listStudentGradableSubmissions(organizationId, studentId);
  if (rows.length === 0) return null;

  const pdf = await PDFDocument.create();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const detail = await getSubmissionDetail(organizationId, row.submissionId);
    const solutionFiles = detail?.solutionFiles.filter(isPdfFile) ?? [];

    const startPage = pdf.getPageCount();
    await addDividerPage(pdf, {
      ...row,
      index: i + 1,
      total: rows.length,
      kind: "solutions",
      note: solutionFiles.length === 0 ? "No answer key PDF is registered for this submission." : undefined,
    });
    let appended = 1;
    for (const f of solutionFiles) {
      const file = await readStored(f);
      if (!file) continue;
      try {
        appended += await appendPdf(pdf, file.body);
      } catch {
        continue;
      }
    }
    if (appended <= 1 && solutionFiles.length > 0) pdf.removePage(startPage);
  }

  return pdf.getPageCount() > 0 ? pdf.save() : null;
}

export async function buildSubmissionAnswerPdf(
  organizationId: string,
  submissionId: string,
): Promise<Uint8Array | null> {
  const imgs = await db
    .select()
    .from(submissionImages)
    .where(eq(submissionImages.submissionId, submissionId))
    .orderBy(asc(submissionImages.attemptNo), asc(submissionImages.sortOrder));

  const orgImgs = imgs.filter((i) => i.organizationId === organizationId);
  const latestAttempt = orgImgs.reduce((m, i) => Math.max(m, i.attemptNo), 0);
  const pageImgs = orgImgs.filter((i) => i.attemptNo === latestAttempt);
  if (pageImgs.length === 0) return null;

  const pdf = await PDFDocument.create();
  for (const im of pageImgs) {
    const file = await readStored(im);
    if (!file) continue;
    if (isPdfFile(im)) {
      try {
        await appendPdf(pdf, file.body);
      } catch {
        continue;
      }
      continue;
    }

    const bytes = new Uint8Array(file.body);
    let embedded;
    try {
      embedded =
        (im.contentType || "").includes("png") || im.fileName.toLowerCase().endsWith(".png")
          ? await pdf.embedPng(bytes)
          : await pdf.embedJpg(bytes);
    } catch {
      try {
        embedded = await pdf.embedJpg(bytes);
      } catch {
        continue;
      }
    }
    const page = pdf.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }

  return pdf.getPageCount() > 0 ? pdf.save() : null;
}

export async function getOrCreateMaterialCompleteFile(
  organizationId: string,
  materialId: string,
) {
  const [cached] = await db
    .select()
    .from(materialCompleteFiles)
    .where(eq(materialCompleteFiles.materialId, materialId))
    .limit(1);
  if (cached) return cached;

  const [material] = await db
    .select()
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1);
  if (!material || material.organizationId !== organizationId) return null;

  const [unitRows, fileRows] = await Promise.all([
    db
      .select()
      .from(units)
      .where(eq(units.materialId, materialId))
      .orderBy(asc(units.sortOrder)),
    db
      .select()
      .from(materialFiles)
      .where(eq(materialFiles.materialId, materialId))
      .orderBy(asc(materialFiles.createdAt)),
  ]);

  const pdf = await PDFDocument.create();
  const hasUnitFiles = fileRows.some((f) => f.unitId);
  const orderedFiles = hasUnitFiles
    ? unitRows.flatMap((u) => [
        ...fileRows.filter((f) => f.unitId === u.id && f.kind === "assignment"),
        ...fileRows.filter((f) => f.unitId === u.id && f.kind === "answer_key"),
      ])
    : [
        ...fileRows.filter((f) => f.kind === "assignment"),
        ...fileRows.filter((f) => f.kind === "answer_key"),
      ];

  for (const f of orderedFiles.filter(isPdfFile)) {
    const file = await readStored(f);
    if (!file) continue;
    try {
      await appendPdf(pdf, file.body);
    } catch {
      continue;
    }
  }

  if (pdf.getPageCount() === 0) return null;

  const out = await pdf.save();
  const fileName = `${material.name} 一冊分.pdf`;
  const pathname = `${organizationId}/materials/${materialId}/complete/${Date.now()}-${safeFileStem(material.name)}.pdf`;
  const stored = await saveBlob(pathname, out, "application/pdf");

  const [row] = await db
    .insert(materialCompleteFiles)
    .values({
      organizationId,
      materialId,
      blobUrl: stored.url,
      pathname: stored.pathname,
      fileName,
      contentType: "application/pdf",
      size: out.byteLength,
    })
    .onConflictDoUpdate({
      target: materialCompleteFiles.materialId,
      set: {
        blobUrl: stored.url,
        pathname: stored.pathname,
        fileName,
        contentType: "application/pdf",
        size: out.byteLength,
      },
    })
    .returning();

  return row;
}
