import type { SubmissionImage } from "@/db/schema";

/**
 * 答案ファイルの表示。src は認証付き配信ルートを指す (公開URLを直接使わない)。
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
    return <p className="empty">まだ答案ファイルは提出されていません。</p>;
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
                <AnswerFile key={img.id} file={img} large />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              {byAttempt.get(attempt)!.map((img) => (
                <AnswerFile key={img.id} file={img} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function isPdf(file: SubmissionImage) {
  return file.contentType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");
}

function AnswerFile({ file, large = false }: { file: SubmissionImage; large?: boolean }) {
  const url = `/api/files/submission/${file.id}`;
  if (isPdf(file)) {
    if (large) {
      return (
        <div className="answer-pdf-large">
          <div className="answer-pdf-head">
            <span className="answer-pdf-icon">PDF</span>
            <span className="answer-pdf-name">{file.fileName}</span>
            <a href={url} target="_blank" rel="noreferrer" className="db-badge">開く</a>
            <a href={`${url}?dl=1`} className="db-badge">保存する</a>
          </div>
          <iframe src={url} title={file.fileName} />
        </div>
      );
    }

    return (
      <a href={url} target="_blank" rel="noreferrer" className="answer-file-thumb">
        <span className="answer-file-icon">PDF</span>
        <span className="answer-file-name">{file.fileName}</span>
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={large ? "answer-large" : "answer-thumb"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={file.fileName} />
    </a>
  );
}
