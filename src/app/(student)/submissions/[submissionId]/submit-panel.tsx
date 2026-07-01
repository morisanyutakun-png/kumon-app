"use client";

import { useState } from "react";

import { PdfAnnotator } from "./pdf-annotator";
import { SubmitForm } from "./submit-form";

export function SubmitPanel({
  submissionId,
  resubmit,
  pdfUrl,
  secondary = false,
}: {
  submissionId: string;
  resubmit?: boolean;
  pdfUrl: string | null;
  secondary?: boolean;
}) {
  const [mode, setMode] = useState<"write" | "photo">(pdfUrl ? "write" : "photo");

  if (!pdfUrl) {
    return <SubmitForm submissionId={submissionId} resubmit={resubmit} secondary={secondary} />;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="submit-modes">
        <button type="button" className={`submit-mode${mode === "write" ? " on" : ""}`} onClick={() => setMode("write")}>
          ✏️ PDFに書き込む
        </button>
        <button type="button" className={`submit-mode${mode === "photo" ? " on" : ""}`} onClick={() => setMode("photo")}>
          📷 {secondary ? "写真で提出" : "写真で出す"}
        </button>
      </div>

      {mode === "write" ? (
        <PdfAnnotator pdfUrl={pdfUrl} submissionId={submissionId} resubmit={resubmit} />
      ) : (
        <SubmitForm submissionId={submissionId} resubmit={resubmit} secondary={secondary} />
      )}
    </div>
  );
}
