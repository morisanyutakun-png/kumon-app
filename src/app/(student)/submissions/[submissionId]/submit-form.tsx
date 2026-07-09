"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";
import { clearPendingAnswerFiles, loadPendingAnswerFiles } from "@/lib/pending-answer-files";

const MAX_FILES = 3;

type Pick = { file: File; url: string; persisted?: boolean };

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function SubmitForm({
  submissionId,
  resubmit,
  secondary = false,
}: {
  submissionId: string;
  resubmit?: boolean;
  secondary?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const picksRef = useRef<Pick[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    picksRef.current = picks;
  }, [picks]);

  useEffect(() => {
    return () => picksRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPendingAnswerFiles(submissionId).then((files) => {
      if (cancelled || files.length === 0) return;
      setPicks((prev) => {
        if (prev.some((p) => p.persisted)) return prev;
        const room = Math.max(0, MAX_FILES - prev.length);
        const added = files.slice(0, room).map((file) => ({
          file,
          url: URL.createObjectURL(file),
          persisted: true,
        }));
        if (added.length > 0) {
          toast.success("書き込みPDFを添付しました。内容を確認して提出できます。");
        }
        return [...added, ...prev];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const room = MAX_FILES - picks.length;
    if (room <= 0) {
      toast.warning(`添付できるファイルは${MAX_FILES}件までです。`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const selected = Array.from(files).slice(0, room);
    if (files.length > room) {
      toast.warning(`添付できるファイルは${MAX_FILES}件までです。超過分は追加していません。`);
    }
    const added = selected.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPicks((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(i: number) {
    setPicks((prev) => {
      const removed = prev[i];
      if (removed?.persisted) void clearPendingAnswerFiles(submissionId);
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function submit() {
    if (picks.length === 0) {
      inputRef.current?.click();
      return;
    }
    const fd = new FormData();
    for (const p of picks) fd.append("files", p.file);
    startTransition(async () => {
      try {
        await submitAnswer(submissionId, fd);
        await clearPendingAnswerFiles(submissionId);
        try { localStorage.removeItem(`kumon-ink-v1-${submissionId}`); } catch { /* noop */ }
        toast.success(resubmit ? "再提出しました。" : "提出しました。すぐに答え合わせへ進めます。");
        picks.forEach((p) => URL.revokeObjectURL(p.url));
        setPicks([]);
        router.push(`/submissions/${submissionId}#self-grade`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "提出に失敗しました。");
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <input
        ref={inputRef}
        type="file"
        name="files"
        accept="application/pdf,image/*"
        multiple
        onChange={onPicked}
        style={{ display: "none" }}
      />

      {picks.length === 0 ? (
        <button type="button" className="photo-drop" onClick={() => inputRef.current?.click()}>
          <span className="photo-drop-ico" aria-hidden>📎</span>
          <span style={{ fontWeight: 700 }}>{secondary ? "PDF・写真を添付する" : "PDF・写真をえらぶ"}</span>
          <span className="muted" style={{ fontSize: 13 }}>
            GoodNotesなどで書き込んだPDF、途中式の写真も添付できます（最大{MAX_FILES}件）
          </span>
        </button>
      ) : (
        <>
          <div className="photo-grid">
            {picks.map((p, i) =>
              isPdf(p.file) ? (
                <div key={p.url} className="photo-file">
                  <span className="photo-file-icon">PDF</span>
                  <span className="photo-file-name">{p.file.name}</span>
                  <span className="photo-file-size">{formatBytes(p.file.size)}</span>
                  <button type="button" className="photo-del" onClick={() => remove(i)} aria-label="削除">×</button>
                </div>
              ) : (
                <div key={p.url} className="photo-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`選択 ${i + 1}`} />
                  <button type="button" className="photo-del" onClick={() => remove(i)} aria-label="削除">×</button>
                </div>
              ),
            )}
            {picks.length < MAX_FILES && (
              <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>＋ 追加</button>
            )}
          </div>
          <p className="photo-help">
            {picks.length} / {MAX_FILES} 件 添付中。提出するとすぐに解答解説で答え合わせへ進めます。
          </p>
        </>
      )}

      <div>
        <button type="button" className="btn-primary big" onClick={submit} disabled={pending}>
          {pending
            ? "提出中…"
            : picks.length === 0
              ? secondary ? "まず答案を添付する" : "まず答案をえらぶ"
              : resubmit ? "この内容で再提出する" : "この内容で提出する"}
        </button>
      </div>
    </div>
  );
}
