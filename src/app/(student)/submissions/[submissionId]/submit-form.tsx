"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";

type Pick = { file: File; url: string };

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

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const added = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPicks((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(i: number) {
    setPicks((prev) => {
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
        toast.success(resubmit ? "再提出しました。" : secondary ? "提出しました。" : "提出しました。おつかれさま！");
        picks.forEach((p) => URL.revokeObjectURL(p.url));
        setPicks([]);
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
          <span style={{ fontWeight: 700 }}>{secondary ? "PDF・写真を選んで提出" : "PDF・写真をえらんで提出"}</span>
          <span className="muted" style={{ fontSize: 13 }}>
            GoodNotesなどで書き込んだPDF、または答案写真を選べます
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
            <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>＋ 追加</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>{picks.length} 件 選択中</p>
        </>
      )}

      <div>
        <button type="button" className="btn-primary big" onClick={submit} disabled={pending}>
          {pending ? "送信中…" : picks.length === 0 ? (secondary ? "PDF・写真を選んで提出" : "PDF・写真をえらんで提出") : resubmit ? "再提出する" : "提出する"}
        </button>
      </div>
    </div>
  );
}
