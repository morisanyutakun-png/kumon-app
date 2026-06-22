import type { SubmissionImage } from "@/db/schema";

/**
 * 答案画像の表示。src は認証付き配信ルートを指す (公開URLを直接使わない)。
 * large=true で採点ワークスペース用の大きな表示。
 */
export function AnswerImages({
  images,
  large = false,
}: {
  images: SubmissionImage[];
  large?: boolean;
}) {
  if (images.length === 0) {
    return <p className="empty">まだ答案画像は提出されていません。</p>;
  }

  const byAttempt = new Map<number, SubmissionImage[]>();
  for (const img of images) {
    const list = byAttempt.get(img.attemptNo) ?? [];
    list.push(img);
    byAttempt.set(img.attemptNo, list);
  }
  const attempts = [...byAttempt.keys()].sort((a, b) => b - a);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {attempts.map((attempt) => (
        <div key={attempt}>
          <div className="muted" style={{ marginBottom: 6, fontWeight: 700 }}>
            {attempt} 回目の提出
          </div>
          {large ? (
            <div style={{ display: "grid", gap: 12 }}>
              {byAttempt.get(attempt)!.map((img) => (
                <a key={img.id} href={`/api/files/submission/${img.id}`} target="_blank" rel="noreferrer" className="answer-large">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/submission/${img.id}`} alt={img.fileName} />
                </a>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              {byAttempt.get(attempt)!.map((img) => (
                <a key={img.id} href={`/api/files/submission/${img.id}`} target="_blank" rel="noreferrer" className="answer-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/submission/${img.id}`} alt={img.fileName} />
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
