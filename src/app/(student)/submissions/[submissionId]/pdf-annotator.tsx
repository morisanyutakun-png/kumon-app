"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitAnswer } from "@/lib/actions/submission-actions";

/** 正規化座標(0〜1)の点。表示サイズ・ズームが変わっても保持できる。 */
type Point = { x: number; y: number };
type Stroke = { color: string; width: number; erase: boolean; points: Point[] };
type Tf = { z: number; tx: number; ty: number };
type XY = { x: number; y: number };

const COLORS = ["#1f2937", "#e11d48", "#2563eb", "#16a34a", "#f59e0b"];
const PEN_WIDTHS = [2, 4, 7];
const MIN_Z = 1;
const MAX_Z = 6;

function clampZ(z: number) {
  return Math.min(MAX_Z, Math.max(MIN_Z, z));
}

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
  fullBleed?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null); // ビューポート(固定枠)
  const surfaceRef = useRef<HTMLDivElement>(null); // 変形(ズーム/パン)する層
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);

  const pdfRef = useRef<any>(null);
  const strokesRef = useRef<Map<number, Stroke[]>>(new Map());
  const drawingRef = useRef<Stroke | null>(null);
  const drawIdRef = useRef<number | null>(null); // 描画中ポインタID
  const drawIsTouchRef = useRef(false);
  const penActiveRef = useRef(false); // Apple Pencil 等が接地中 → 手(タッチ)を無視
  const displayWRef = useRef(0);
  const displayHRef = useRef(0);

  // ズーム/パン
  const tfRef = useRef<Tf>({ z: 1, tx: 0, ty: 0 });
  const touchesRef = useRef<Map<number, XY>>(new Map()); // ジェスチャ用タッチ(stage座標)
  const gestureRef = useRef<{ mid: XY; dist: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1]);
  const [fingerDraw, setFingerDraw] = useState(false); // OFF=ペンのみ(手のひら無効化)
  const [zoomPct, setZoomPct] = useState(100);
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

  // ---- 変形(ズーム/パン)の適用 ----
  const applyTf = useCallback(() => {
    const surface = surfaceRef.current;
    const stage = stageRef.current;
    if (!surface || !stage) return;
    const t = tfRef.current;
    const sW = stage.clientWidth, sH = stage.clientHeight;
    const cw = displayWRef.current * t.z, ch = displayHRef.current * t.z;
    // はみ出し過ぎないようクランプ(小さいときは中央寄せ)
    t.tx = cw <= sW ? (sW - cw) / 2 : Math.min(0, Math.max(sW - cw, t.tx));
    t.ty = ch <= sH ? (sH - ch) / 2 : Math.min(0, Math.max(sH - ch, t.ty));
    surface.style.transform = `translate(${t.tx}px, ${t.ty}px) scale(${t.z})`;
  }, []);

  const zoomAround = useCallback((p: XY, ratio: number) => {
    const t = tfRef.current;
    const nz = clampZ(t.z * ratio);
    const k = nz / t.z;
    t.tx = p.x - (p.x - t.tx) * k;
    t.ty = p.y - (p.y - t.ty) * k;
    t.z = nz;
    applyTf();
    setZoomPct(Math.round(nz * 100));
  }, [applyTf]);

  function zoomButton(factor: number) {
    const stage = stageRef.current;
    if (!stage) return;
    zoomAround({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 }, factor);
  }
  function resetZoom() {
    tfRef.current = { z: 1, tx: 0, ty: 0 };
    applyTf();
    setZoomPct(100);
  }

  // ---- 現在ページを描画 ----
  const renderPage = useCallback(async () => {
    const doc = pdfRef.current;
    const stage = stageRef.current;
    const pageCanvas = pageCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    if (!doc || !stage || !pageCanvas || !inkCanvas) return;

    const page = await doc.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const cap = fullBleed ? 2200 : 1100;
    const maxW = Math.min(stage.clientWidth || 900, cap);
    const scale = maxW / base.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    displayWRef.current = viewport.width;
    displayHRef.current = viewport.height;

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
    applyTf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, fullBleed, applyTf]);

  useEffect(() => {
    if (ready) renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pageNum]);

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
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
    if (s.points.length === 1) ctx.lineTo(s.points[0].x * w + 0.1, s.points[0].y * h + 0.1);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- 座標変換 ----
  function toNorm(clientX: number, clientY: number): Point {
    const rect = inkCanvasRef.current!.getBoundingClientRect(); // 変形後の矩形
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }
  function toStage(clientX: number, clientY: number): XY {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  function snapshot(): { mid: XY; dist: number } | null {
    const pts = [...touchesRef.current.values()];
    if (pts.length === 0) return null;
    if (pts.length === 1) return { mid: pts[0], dist: 0 };
    const [a, b] = pts;
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  // ---- 描画開始/継続/終了 ----
  function startStroke(clientX: number, clientY: number, id: number, isTouch: boolean) {
    const erase = tool === "eraser";
    const stroke: Stroke = {
      color,
      width: erase ? Math.max(16, width * 4) : width,
      erase,
      points: [toNorm(clientX, clientY)],
    };
    drawingRef.current = stroke;
    drawIdRef.current = id;
    drawIsTouchRef.current = isTouch;
    const list = strokesRef.current.get(pageNum) ?? [];
    list.push(stroke);
    strokesRef.current.set(pageNum, list);
    redrawInk();
  }
  function cancelStroke() {
    if (!drawingRef.current) return;
    const list = strokesRef.current.get(pageNum);
    if (list && list[list.length - 1] === drawingRef.current) list.pop();
    drawingRef.current = null;
    drawIdRef.current = null;
    drawIsTouchRef.current = false;
    redrawInk();
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!ready) return;

    if (e.pointerType === "touch") {
      if (penActiveRef.current) return; // ペン使用中は手のひらを無視(パームリジェクション)
      const pos = toStage(e.clientX, e.clientY);
      touchesRef.current.set(e.pointerId, pos);
      const count = touchesRef.current.size;
      if (fingerDraw && count === 1) {
        // 指で書くモード: 1本指は描画
        e.preventDefault();
        startStroke(e.clientX, e.clientY, e.pointerId, true);
      } else {
        // ジェスチャ(パン/ピンチ)。指描画中に2本目が来たら描画を取り消してジェスチャへ
        if (drawIsTouchRef.current) cancelStroke();
        gestureRef.current = snapshot();
      }
      return;
    }

    // ペン / マウス → 常に描画。ペンなら手のひら無効化を有効化
    e.preventDefault();
    inkCanvasRef.current!.setPointerCapture(e.pointerId);
    if (e.pointerType === "pen") penActiveRef.current = true;
    // ペンが触れたらタッチ系のジェスチャ状態はクリア
    touchesRef.current.clear();
    gestureRef.current = null;
    startStroke(e.clientX, e.clientY, e.pointerId, false);
  }

  function onPointerMove(e: React.PointerEvent) {
    // 描画中ポインタ
    if (drawingRef.current && e.pointerId === drawIdRef.current) {
      e.preventDefault();
      const stroke = drawingRef.current;
      const evts = (e.nativeEvent as any).getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const ev of evts) stroke.points.push(toNorm(ev.clientX, ev.clientY));
      redrawInk();
      return;
    }
    // タッチ・ジェスチャ
    if (e.pointerType === "touch" && touchesRef.current.has(e.pointerId)) {
      e.preventDefault();
      touchesRef.current.set(e.pointerId, toStage(e.clientX, e.clientY));
      const snap = snapshot();
      const prev = gestureRef.current;
      if (snap && prev && touchesRef.current.size === (prev.dist > 0 ? 2 : 1)) {
        if (snap.dist > 0 && prev.dist > 0) zoomAround(snap.mid, snap.dist / prev.dist);
        const t = tfRef.current;
        t.tx += snap.mid.x - prev.mid.x;
        t.ty += snap.mid.y - prev.mid.y;
        applyTf();
      }
      gestureRef.current = snap;
    }
  }

  function endPointer(e: React.PointerEvent) {
    if (e.pointerId === drawIdRef.current) {
      drawingRef.current = null;
      drawIdRef.current = null;
      drawIsTouchRef.current = false;
      force((n) => n + 1);
    }
    if (e.pointerType === "pen") penActiveRef.current = false;
    if (touchesRef.current.has(e.pointerId)) {
      touchesRef.current.delete(e.pointerId);
      gestureRef.current = snapshot();
    }
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
          const factor = canvas.width / (displayWRef.current || canvas.width);
          for (const s of strokes) {
            drawStroke(ictx, { ...s, width: s.width * factor }, canvas.width, canvas.height);
          }
          ctx.drawImage(ink, 0, 0);
        }

        const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
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
      <div className="annot-toolbar">
        <div className="annot-tools">
          <button type="button" className={`annot-btn${tool === "pen" ? " on" : ""}`} onClick={() => setTool("pen")}>✏️ ペン</button>
          <button type="button" className={`annot-btn${tool === "eraser" ? " on" : ""}`} onClick={() => setTool("eraser")}>🩹 消しゴム</button>
        </div>
        <div className="annot-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`annot-swatch${color === c && tool === "pen" ? " on" : ""}`} style={{ background: c }} onClick={() => { setColor(c); setTool("pen"); }} aria-label={`色 ${c}`} />
          ))}
        </div>
        <div className="annot-widths">
          {PEN_WIDTHS.map((w) => (
            <button key={w} type="button" className={`annot-btn${width === w ? " on" : ""}`} onClick={() => setWidth(w)}>
              <span style={{ display: "inline-block", width: w * 2 + 2, height: w * 2 + 2, borderRadius: "50%", background: "#1f2937" }} />
            </button>
          ))}
        </div>
        <div className="annot-zoom">
          <button type="button" className="annot-btn" onClick={() => zoomButton(1 / 1.25)} aria-label="縮小">－</button>
          <span className="annot-zoom-val">{zoomPct}%</span>
          <button type="button" className="annot-btn" onClick={() => zoomButton(1.25)} aria-label="拡大">＋</button>
          <button type="button" className="annot-btn" onClick={resetZoom}>等倍</button>
        </div>
        <div className="annot-edit">
          <button type="button" className={`annot-btn${fingerDraw ? " on" : ""}`} onClick={() => setFingerDraw((v) => !v)} title="指で書く / ペンのみ(手を無効化)">
            {fingerDraw ? "🖐 指で書く" : "✋ ペンのみ"}
          </button>
          <button type="button" className="annot-btn" onClick={undo}>↩ 戻す</button>
          <button type="button" className="annot-btn" onClick={clearPage}>消去</button>
        </div>
      </div>

      <div ref={stageRef} className="annot-stage">
        {!ready && <div className="annot-loading">読み込み中…</div>}
        <div
          ref={surfaceRef}
          className="annot-surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div className="annot-canvas-wrap">
            <canvas ref={pageCanvasRef} className="annot-page" />
            <canvas ref={inkCanvasRef} className="annot-ink" />
          </div>
        </div>
      </div>

      {numPages > 1 && (
        <div className="annot-pager">
          <button type="button" className="annot-btn" onClick={() => { resetZoom(); setPageNum((n) => Math.max(1, n - 1)); }} disabled={pageNum <= 1}>← 前</button>
          <span>{pageNum} / {numPages} ページ</span>
          <button type="button" className="annot-btn" onClick={() => { resetZoom(); setPageNum((n) => Math.min(numPages, n + 1)); }} disabled={pageNum >= numPages}>次 →</button>
        </div>
      )}

      <div className="annot-submit">
        <button type="button" className="btn-primary big" onClick={submit} disabled={!ready || submitting}>
          {submitting ? "提出中…" : resubmit ? "✓ 書き込んで再提出" : "✓ 完了して提出"}
        </button>
        {!hasAnyInk && ready && <span className="muted" style={{ marginLeft: 10 }}>書き込んでから提出してください。</span>}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        ペン(Apple Pencil等)で書けます。手のひらは無視され、指でのピンチで拡大・1本指でスクロールできます。指でも書きたいときは「ペンのみ」を切り替え。
      </p>
    </div>
  );
}
