/** 業務画面の即時ローディング表示 (クリック直後に表示され体感速度を上げる)。 */
export default function Loading() {
  return (
    <div>
      <div className="skel" style={{ height: 28, width: 220, marginBottom: 8 }} />
      <div className="skel" style={{ height: 14, width: 360, marginBottom: 18 }} />
      <div className="card">
        <div className="skel" style={{ height: 16, width: 160, marginBottom: 14 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 38, marginBottom: 8 }} />
        ))}
      </div>
    </div>
  );
}
