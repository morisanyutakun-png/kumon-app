"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Plus,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
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
    <div className="submit-form">
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
          <span className="photo-drop-ico" aria-hidden><UploadCloud size={24} /></span>
          <span className="photo-drop-text">
            <b>{secondary ? "答案ファイルを選ぶ" : "答案をえらぶ"}</b>
            <small>PDF・写真・GoodNotes（最大{MAX_FILES}件）</small>
          </span>
        </button>
      ) : (
        <>
          <div className="photo-attached-head">
            <span><CheckCircle2 size={17} aria-hidden />添付済み</span>
            <b>{picks.length} / {MAX_FILES}</b>
          </div>
          <div className="photo-grid">
            {picks.map((p, i) =>
              isPdf(p.file) ? (
                <div key={p.url} className="photo-file">
                  <span className="photo-file-icon"><FileText size={18} aria-hidden />PDF</span>
                  <span className="photo-file-name">{p.file.name}</span>
                  <span className="photo-file-size">{formatBytes(p.file.size)}</span>
                  <button type="button" className="photo-del" onClick={() => remove(i)} aria-label="削除">
                    <X size={15} aria-hidden />
                  </button>
                </div>
              ) : (
                <div key={p.url} className="photo-thumb">
                  <span className="photo-kind"><ImageIcon size={15} aria-hidden />写真</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`選択 ${i + 1}`} />
                  <button type="button" className="photo-del" onClick={() => remove(i)} aria-label="削除">
                    <X size={15} aria-hidden />
                  </button>
                </div>
              ),
            )}
            {picks.length < MAX_FILES && (
              <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>
                <Plus size={20} aria-hidden />
                追加
              </button>
            )}
          </div>
        </>
      )}

      {picks.length > 0 && (
        <div className="submit-form-actions">
          <button type="button" className="submit-final-button" onClick={submit} disabled={pending}>
            {!pending && <Send size={18} aria-hidden />}
            {pending ? "提出中…" : resubmit ? "再提出する" : "提出する"}
          </button>
        </div>
      )}
    </div>
  );
}
