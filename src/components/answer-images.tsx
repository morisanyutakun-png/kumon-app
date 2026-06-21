import type { SubmissionImage } from "@/db/schema";

/**
 * 答案画像の表示。src は認証付き配信ルートを指す (公開URLを直接使わない)。
 * 提出回 (attemptNo) ごとにまとめて表示。
 */
export function AnswerImages({ images }: { images: SubmissionImage[] }) {
  if (images.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        まだ答案画像は提出されていません。
      </p>
    );
  }

  const byAttempt = new Map<number, SubmissionImage[]>();
  for (const img of images) {
    const list = byAttempt.get(img.attemptNo) ?? [];
    list.push(img);
    byAttempt.set(img.attemptNo, list);
  }
  const attempts = [...byAttempt.keys()].sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      {attempts.map((attempt) => (
        <div key={attempt}>
          <div className="mb-2 text-xs font-medium text-slate-500">
            {attempt} 回目の提出
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {byAttempt.get(attempt)!.map((img) => (
              <a
                key={img.id}
                href={`/api/files/submission/${img.id}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/submission/${img.id}`}
                  alt={img.fileName}
                  className="h-40 w-full object-contain"
                />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
