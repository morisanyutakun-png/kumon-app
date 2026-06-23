"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";

/** 正規化座標(0〜1)の点。表示サイズが変わっても保持できる。 */
type Point = { x: number; y: number };
type Stroke = { color: string; width: number; erase: boolean; points: Point[] };

const COLORS = ["#1f2937", "#e11d48", "#2563eb", "#16a34a", "#f59e0b"];
const PEN_WIDTHS = [2, 4, 7];

export function PdfAnnotator({
  pdfUrl,
  submissionId,
  resubmit,
  fullBleed = false,
  redirectTo,
}: {
  pdfUrl: string;
  submissionId: string;
  resubmit?: boolean;
  /** 全画面モード: 画面幅いっぱいまでPDFを大きく表示。 */
  fullBleed?: boolean;
  /** 提出後にこのURLへ遷移(全画面演習→提出ページへ戻る等)。 */
  redirectTo?: string;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);

  // pdfjs ドキュメントは ref で保持(再レンダー対象外)
  const pdfRef = useRef<any>(null);
  const strokesRef = useRef<Map<number, Stroke[]>>(new Map());
  const drawingRef = useRef<Stroke | null>(null);
  const displayWRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1]);
  const [submitting, setSubmitting] = useState(false);
  const [, force] = useState(0);

  // ---- pdfjs ロード ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadError("PDFを開けませんでした。写真での提出をご利用ください。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // ---- 現在ページを描画 ----
  const renderPage = useCallback(async () => {
    const doc = pdfRef.current;
    const wrap = wrapRef.current;
    const pageCanvas = pageCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    if (!doc || !wrap || !pageCanvas || !inkCanvas) return;

    const page = await doc.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const cap = fullBleed ? 2200 : 1100;
    const maxW = Math.min(wrap.clientWidth || 900, cap);
    const scale = maxW / base.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    displayWRef.current = viewport.width;

    for (const c of [pageCanvas, inkCanvas]) {
      c.width = Math.floor(viewport.width * dpr);
      c.height = Math.floor(viewport.height * dpr);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
    }

    const ctx = pageCanvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport }).promise;

    redrawInk();
  }, [pageNum, fullBleed]);

  useEffect(() => {
    if (ready) renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pageNum]);

  // 画面幅変更で再描画
  useEffect(() => {
    if (!ready) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => renderPage(), 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function redrawInk() {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = inkCanvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    const w = displayWRef.current;
    const h = inkCanvas.height / dpr;
    const strokes = strokesRef.current.get(pageNum) ?? [];
    for (const s of strokes) drawStroke(ctx, s, w, h);
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
    if (s.points.length === 0) return;
    ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
    }
    if (s.points.length === 1) {
      // 点を打つ
      ctx.lineTo(s.points[0].x * w + 0.1, s.points[0].y * h + 0.1);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- 入力(ペン/指/マウス) ----
  function toPoint(e: React.PointerEvent): Point {
    const rect = inkCanvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!ready) return;
    e.preventDefault();
    inkCanvasRef.current!.setPointerCapture(e.pointerId);
    const erase = tool === "eraser";
    const stroke: Stroke = {
      color,
      width: erase ? Math.max(16, width * 4) : width,
      erase,
      points: [toPoint(e)],
    };
    drawingRef.current = stroke;
    const list = strokesRef.current.get(pageNum) ?? [];
    list.push(stroke);
    strokesRef.current.set(pageNum, list);
    redrawInk();
  }

  function onPointerMove(e: React.PointerEvent) {
    const stroke = drawingRef.current;
    if (!stroke) return;
    e.preventDefault();
    // 滑らかさのため複数イベントを取り込む
    const evts = (e.nativeEvent as any).getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evts) {
      const rect = inkCanvasRef.current!.getBoundingClientRect();
      stroke.points.push({
        x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
      });
    }
    redrawInk();
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = null;
    force((n) => n + 1); // ボタン活性更新
  }

  function undo() {
    const list = strokesRef.current.get(pageNum);
    if (list && list.length) {
      list.pop();
      redrawInk();
      force((n) => n + 1);
    }
  }
  function clearPage() {
    strokesRef.current.set(pageNum, []);
    redrawInk();
    force((n) => n + 1);
  }

  const hasAnyInk = [...strokesRef.current.values()].some((l) => l.length > 0);

  // ---- 提出: 全ページを画像化して submitAnswer ----
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const doc = pdfRef.current;
      const files: File[] = [];
      for (let pn = 1; pn <= numPages; pn++) {
        const page = await doc.getPage(pn);
        const base = page.getViewport({ scale: 1 });
        const exportScale = Math.min(2, 1600 / base.width);
        const vp = page.getViewport({ scale: Math.max(1, exportScale) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const strokes = strokesRef.current.get(pn) ?? [];
        if (strokes.length) {
          const ink = document.createElement("canvas");
          ink.width = canvas.width;
          ink.height = canvas.height;
          const ictx = ink.getContext("2d")!;
          // 表示時の線幅 → 書き出し解像度へスケール
          const factor = canvas.width / (displayWRef.current || canvas.width);
          for (const s of strokes) {
            drawStroke(
              ictx,
              { ...s, width: s.width * factor },
              canvas.width,
              canvas.height,
            );
          }
          ctx.drawImage(ink, 0, 0);
        }

        const blob: Blob = await new Promise((res) =>
          canvas.toBlob((b) => res(b!), "image/png"),
        );
        files.push(new File([blob], `page-${pn}.png`, { type: "image/png" }));
      }

      const fd = new FormData();
      for (const f of files) fd.append("images", f);
      await submitAnswer(submissionId, fd);
      toast.success(resubmit ? "再提出しました。" : "提出しました。おつかれさま！");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "提出に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="r-NG" style={{ margin: 0 }}>{loadError}</p>;
  }

  return (
    <div className="annotator">
      {/* ツールバー */}
      <div className="annot-toolbar">
        <div className="annot-tools">
          <button type="button" className={`annot-btn${tool === "pen" ? " on" : ""}`} onClick={() => setTool("pen")} title="ペン">✏️ ペン</button>
          <button type="button" className={`annot-btn${tool === "eraser" ? " on" : ""}`} onClick={() => setTool("eraser")} title="消しゴム">🩹 消しゴム</button>
        </div>
        <div className="annot-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`annot-swatch${color === c && tool === "pen" ? " on" : ""}`}
              style={{ background: c }}
              onClick={() => { setColor(c); setTool("pen"); }}
              aria-label={`色 ${c}`}
            />
          ))}
        </div>
        <div className="annot-widths">
          {PEN_WIDTHS.map((w) => (
            <button key={w} type="button" className={`annot-btn${width === w ? " on" : ""}`} onClick={() => setWidth(w)}>
              <span style={{ display: "inline-block", width: w * 2 + 2, height: w * 2 + 2, borderRadius: "50%", background: "#1f2937" }} />
            </button>
          ))}
        </div>
        <div className="annot-edit">
          <button type="button" className="annot-btn" onClick={undo}>↩ 戻す</button>
          <button type="button" className="annot-btn" onClick={clearPage}>このページを消す</button>
        </div>
      </div>

      {/* キャンバス */}
      <div ref={wrapRef} className="annot-stage">
        {!ready && <div className="annot-loading">読み込み中…</div>}
        <div className="annot-canvas-wrap" style={{ touchAction: "none" }}>
          <canvas ref={pageCanvasRef} className="annot-page" />
          <canvas
            ref={inkCanvasRef}
            className="annot-ink"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      </div>

      {/* ページ送り */}
      {numPages > 1 && (
        <div className="annot-pager">
          <button type="button" className="annot-btn" onClick={() => setPageNum((n) => Math.max(1, n - 1))} disabled={pageNum <= 1}>← 前</button>
          <span>{pageNum} / {numPages} ページ</span>
          <button type="button" className="annot-btn" onClick={() => setPageNum((n) => Math.min(numPages, n + 1))} disabled={pageNum >= numPages}>次 →</button>
        </div>
      )}

      {/* 提出 */}
      <div className="annot-submit">
        <button type="button" className="btn-primary big" onClick={submit} disabled={!ready || submitting}>
          {submitting ? "提出中…" : resubmit ? "✓ 書き込んで再提出" : "✓ 完了して提出"}
        </button>
        {!hasAnyInk && ready && (
          <span className="muted" style={{ marginLeft: 10 }}>書き込んでから提出してください。</span>
        )}
      </div>
    </div>
  );
}
