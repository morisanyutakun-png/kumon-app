import "server-only";

import { asc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";

import { db } from "@/db";
import {
  materialCompleteFiles,
  materialFiles,
  materials,
  submissionImages,
  units,
} from "@/db/schema";
import { readStored, saveBlob } from "@/lib/blob";

function safeFileStem(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "material";
}

async function appendPdf(target: PDFDocument, body: Buffer | Uint8Array) {
  const src = await PDFDocument.load(body);
  const pages = await target.copyPages(src, src.getPageIndices());
  for (const page of pages) target.addPage(page);
}

function isPdfFile(row: { contentType: string; fileName: string }) {
  return row.contentType === "application/pdf" || row.fileName.toLowerCase().endsWith(".pdf");
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
