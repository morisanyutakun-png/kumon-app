/** 生徒・保護者画面の即時ローディング表示。 */
export default function Loading() {
  return (
    <div>
      <div className="skel" style={{ height: 26, width: 160, marginBottom: 16 }} />
      <div className="card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 44, marginBottom: 10 }} />
        ))}
      </div>
    </div>
  );
}
