"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";

type Pick = { file: File; url: string };

export function SubmitForm({
  submissionId,
  resubmit,
}: {
  submissionId: string;
  resubmit?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => picks.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    for (const p of picks) fd.append("images", p.file);
    startTransition(async () => {
      try {
        await submitAnswer(submissionId, fd);
        toast.success(resubmit ? "再提出しました。" : "提出しました。おつかれさま！");
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
        accept="image/*"
        capture="environment"
        multiple
        onChange={onPicked}
        style={{ display: "none" }}
      />

      {picks.length === 0 ? (
        <button type="button" className="photo-drop" onClick={() => inputRef.current?.click()}>
          <span className="photo-drop-ico" aria-hidden>📷</span>
          <span style={{ fontWeight: 700 }}>写真をえらぶ・撮る</span>
          <span className="muted" style={{ fontSize: 13 }}>答案の写真を何枚でも選べます</span>
        </button>
      ) : (
        <>
          <div className="photo-grid">
            {picks.map((p, i) => (
              <div key={p.url} className="photo-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`選択 ${i + 1}`} />
                <button type="button" className="photo-del" onClick={() => remove(i)} aria-label="削除">×</button>
              </div>
            ))}
            <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>＋ 追加</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>{picks.length} 枚 選択中</p>
        </>
      )}

      <div>
        <button type="button" className="btn-primary big" onClick={submit} disabled={pending}>
          {pending ? "送信中…" : picks.length === 0 ? "写真をえらんで提出" : resubmit ? "再提出する" : "提出する"}
        </button>
      </div>
    </div>
  );
}
