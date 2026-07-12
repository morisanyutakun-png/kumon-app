"use client";

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
        {saved.answers ? "✓ 答案PDFを保存済み" : "答案PDFを保存"}
      </a>
      <a
        href={solutionDownloadUrl}
        className={`bundle-save-button secondary${saved.solutions ? " is-saved" : ""}`}
        onClick={() => markSaved("solutions")}
      >
        {saved.solutions ? "✓ 解答解説PDFを保存済み" : "解答解説PDFを保存"}
      </a>
      <p className="bundle-save-note">2つ保存後、点数入力へ移動</p>
    </div>
  );
}
