"use client";

import { BookOpenCheck, CheckCircle2, Download, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type SavedKind = "answers" | "solutions";

interface Props {
  answerDownloadUrl: string;
  solutionDownloadUrl: string;
}

export function StudentBundleDownloadActions({
  answerDownloadUrl,
  solutionDownloadUrl,
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<Record<SavedKind, boolean>>({
    answers: false,
    solutions: false,
  });

  function markSaved(kind: SavedKind) {
    const next = { ...saved, [kind]: true };
    setSaved(next);

    if (next.answers && next.solutions) {
      toast.success("答案PDFと解答解説PDFを保存しました。点数入力へ移動します。");
      window.setTimeout(() => {
        router.push("/grading?tab=input");
        router.refresh();
      }, 1200);
      return;
    }

    toast.info("もう一方のPDFも保存すると、点数入力へ進みます。");
  }

  return (
    <div className="bundle-save-actions" aria-label="採点用PDFの保存">
      <a
        href={answerDownloadUrl}
        className={`bundle-save-button primary${saved.answers ? " is-saved" : ""}`}
        onClick={() => markSaved("answers")}
      >
        {saved.answers ? <CheckCircle2 size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
        <span>
          <b>{saved.answers ? "答案PDF 保存済み" : "答案PDFを保存"}</b>
          <small>提出答案セット</small>
        </span>
      </a>
      <a
        href={solutionDownloadUrl}
        className={`bundle-save-button secondary${saved.solutions ? " is-saved" : ""}`}
        onClick={() => markSaved("solutions")}
      >
        {saved.solutions ? <CheckCircle2 size={18} aria-hidden="true" /> : <BookOpenCheck size={18} aria-hidden="true" />}
        <span>
          <b>{saved.solutions ? "解答PDF 保存済み" : "解答PDFを保存"}</b>
          <small>解答解説セット</small>
        </span>
      </a>
      <p className="bundle-save-note"><FileText size={13} aria-hidden="true" />2つ保存後、点数入力へ移動</p>
    </div>
  );
}
