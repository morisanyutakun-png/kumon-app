import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";

import { db } from "@/db";
import {
  assignments,
  materialCompleteFiles,
  materialFiles,
  materials,
  submissionImages,
  submissionEvents,
  submissionStatusEnum,
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

type BundleStatus = (typeof submissionStatusEnum.enumValues)[number];

export interface StudentBundleOptions {
  statuses?: BundleStatus[];
  submissionIds?: string[];
}

export async function listStudentGradableSubmissions(
  organizationId: string,
  studentId: string,
  options: StudentBundleOptions = {},
) {
  const statuses = options.statuses ?? ["submitted", "grading"];
  const submissionIds = options.submissionIds?.filter(Boolean);
  if (submissionIds && submissionIds.length === 0) return [];

  const filters = [
    eq(submissions.organizationId, organizationId),
    eq(submissions.studentId, studentId),
    inArray(submissions.status, statuses),
  ];
  if (submissionIds) filters.push(inArray(submissions.id, submissionIds));

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
    .where(and(...filters))
    .orderBy(asc(submissions.submittedAt), asc(submissions.createdAt));
}

export async function buildStudentAnswerBundlePdf(
  organizationId: string,
  studentId: string,
  options: StudentBundleOptions = {},
): Promise<{ bytes: Uint8Array; submissions: StudentBundleSubmission[] } | null> {
  const rows = await listStudentGradableSubmissions(organizationId, studentId, options);
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
    let appended = 0;

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

    if (appended <= 0) {
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
  options: StudentBundleOptions = {},
): Promise<Uint8Array | null> {
  const rows = await listStudentGradableSubmissions(organizationId, studentId, options);
  if (rows.length === 0) return null;

  const pdf = await PDFDocument.create();
  for (const row of rows) {
    const detail = await getSubmissionDetail(organizationId, row.submissionId);
    const solutionFiles = detail?.solutionFiles.filter(isPdfFile) ?? [];
    for (const f of solutionFiles) {
      const file = await readStored(f);
      if (!file) continue;
      try {
        await appendPdf(pdf, file.body);
      } catch {
        continue;
      }
    }
  }

  return pdf.getPageCount() > 0 ? pdf.save() : null;
}

/** 答案セットPDFを開いた/保存した提出を「採点中」に移し、添削キューから外す。 */
export async function markStudentBundlePickedForGrading(
  organizationId: string,
  studentId: string,
  submissionIds: string[],
  byUserId: string,
): Promise<number> {
  const ids = [...new Set(submissionIds.filter(Boolean))];
  if (ids.length === 0) return 0;

  return db.transaction(async (tx) => {
    const targets = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.organizationId, organizationId),
          eq(submissions.studentId, studentId),
          eq(submissions.status, "submitted"),
          inArray(submissions.id, ids),
        ),
      );
    if (targets.length === 0) return 0;

    const now = new Date();
    await tx
      .update(submissions)
      .set({ status: "grading", updatedAt: now })
      .where(inArray(submissions.id, targets.map((t) => t.id)));
    await tx.insert(submissionEvents).values(
      targets.map((t) => ({
        organizationId,
        submissionId: t.id,
        fromStatus: "submitted" as const,
        toStatus: "grading" as const,
        byUserId,
        note: "添削用答案セットPDFを取得",
      })),
    );
    return targets.length;
  });
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
