"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getStroke } from "perfect-freehand";

import { submitAnswer } from "@/lib/actions/submission-actions";

/** 正規化座標(0〜1)の点。表示サイズ・ズームが変わっても保持できる。p=筆圧(0〜1)。 */
type Point = { x: number; y: number; p?: number };
type Stroke = { color: string; width: number; erase: boolean; points: Point[] };
type Tf = { z: number; tx: number; ty: number };
type XY = { x: number; y: number };

const COLORS = ["#1f2937", "#e11d48", "#2563eb", "#16a34a", "#f59e0b"];
const PEN_WIDTHS = [2, 4, 7];
const MIN_Z = 1;
const MAX_Z = 6;
// ペンを使った直後のこの時間(ms)内のタッチは「手のひら」とみなして無視する(GoodNotes風)。
// 画数の切れ目(筆を離して次を書く)で手のひらが誤爆しないための猶予。
const PALM_REJECT_MS = 800;

// perfect-freehand(tldraw等が使う実績あるライブラリ)で筆圧つきの塗り輪郭を生成する設定。
// streamline を小さめにして「ペンへの追従(低遅延)」を優先、smoothing で見た目を整える。
const PF = { thinning: 0.6, smoothing: 0.5, streamline: 0.32, simulatePressure: false } as const;
const EMPTY_PTS: Point[] = [];

// perfect-freehand の輪郭点列を Path2D 用の SVG パス文字列に変換(公式README掲載の実装)。
function strokeToPath(pts: number[][]): string {
  const len = pts.length;
  if (len < 2) return "";
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} Q`;
  for (let i = 0; i < len; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % len];
    d += ` ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
  }
  d += " Z";
  return d;
}

function clampZ(z: number) {
  return Math.min(MAX_Z, Math.max(MIN_Z, z));
}

export function PdfAnnotator({
  pdfUrl,
  submissionId,
  resubmit,
  fullBleed = false,
  redirectTo,
  mode = "submit",
  downloadName = "添削",
  penOnly = false,
}: {
  pdfUrl: string;
  submissionId?: string;
  resubmit?: boolean;
  fullBleed?: boolean;
  redirectTo?: string;
  /** "submit"=生徒の提出 / "markup"=採点者の添削(提出せずPDFでダウンロード)。 */
  mode?: "submit" | "markup";
  downloadName?: string;
  /** true=ペン専用(手のひら無効を固定・切替不可)。指はスクロール/ズーム専用。 */
  penOnly?: boolean;
}) {
  const router = useRouter();
  // 手書きをブラウザに自動保存するキー(提出前に閉じても復元できる)。
  const storageKey = submissionId ? `kumon-ink-v1-${submissionId}` : null;
  const stageRef = useRef<HTMLDivElement>(null); // ビューポート(固定枠)
  const surfaceRef = useRef<HTMLDivElement>(null); // 変形(ズーム/パン)する層
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null); // 確定した手書き(committed)
  const activeCanvasRef = useRef<HTMLCanvasElement>(null); // 描画中の1本だけ(最前面, 毎フレーム再描画)
  const inkRectRef = useRef<DOMRect | null>(null); // 描画中は不変なのでストローク開始時にキャッシュ
  const drawnIdxRef = useRef(0); // 消しゴムの増分描画で「描き済み」の点インデックス
  const predictedRef = useRef<Point[]>([]); // 現フレームの予測点(描画のみ、保存しない)
  const renderRafRef = useRef<number | null>(null); // 描画中ストロークの rAF 再描画

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
  // 滑らかなパン/ズームのための補助(毎フレーム描画・レイアウト読みのキャッシュ・慣性)
  const rafRef = useRef<number | null>(null); // 変形適用のrAFバッチ
  const stageRectRef = useRef<DOMRect | null>(null); // stage矩形(移動中の getBoundingClientRect を避ける)
  const stageWRef = useRef(0);
  const stageHRef = useRef(0);
  const zoomLabelRef = useRef<HTMLSpanElement>(null); // ズーム%をReactを介さず直接更新
  const panSampleRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const panVelRef = useRef<XY>({ x: 0, y: 0 }); // 指を離した後の慣性スクロール速度(px/ms)
  const momentumRafRef = useRef<number | null>(null);
  const penOnlyRef = useRef(penOnly);
  penOnlyRef.current = penOnly;
  // ネイティブのポインタリスナは最新の state を ref 経由で読む(再アタッチ不要にするため)。
  const toolRef = useRef<"pen" | "eraser">("pen");
  const colorRef = useRef(COLORS[0]);
  const widthRef = useRef(PEN_WIDTHS[1]);
  const fingerDrawRef = useRef(true);
  const pageNumRef = useRef(1);
  const readyRef = useRef(false);
  const strokeStartTimeRef = useRef(0); // 進行中ストロークの開始時刻(古い pointerup で誤終了しない用)
  const lastPenTimeRef = useRef(-1e9); // 直近のペン(Apple Pencil)イベント時刻。手のひら誤爆判定用
  const hadInkRef = useRef(false); // 直近レンダー時点で手書きがあるか(不要な再描画を避ける)

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1]);
  // 既定は「指・ペンどちらでも書ける」。タッチペン(静電式含む)を前提にするため。
  // OFF にすると Apple Pencil 専用(手のひら無効=パームリジェクション)。
  const [fingerDraw, setFingerDraw] = useState(true);
  // state をネイティブハンドラ用の ref に反映(毎レンダーで同期)。
  toolRef.current = tool;
  colorRef.current = color;
  widthRef.current = width;
  fingerDrawRef.current = fingerDraw;
  pageNumRef.current = pageNum;
  readyRef.current = ready;
  const [zoomPct, setZoomPct] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false); // 提出確認ダイアログ
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
        // 自動保存された手書きを復元(提出前に離脱しても消えないように)。
        if (storageKey) {
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              const arr = JSON.parse(raw) as [number, Stroke[]][];
              const map = new Map<number, Stroke[]>();
              for (const [pg, strokes] of arr) map.set(Number(pg), strokes);
              strokesRef.current = map;
            }
          } catch {
            /* 壊れた保存は無視 */
          }
        }
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
  // stage の寸法・位置をキャッシュ(ジェスチャ中の毎回の getBoundingClientRect/レイアウト読みを避ける)。
  const measureStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stageRectRef.current = stage.getBoundingClientRect();
    stageWRef.current = stage.clientWidth;
    stageHRef.current = stage.clientHeight;
  }, []);

  // はみ出し過ぎないようクランプ(小さいときは中央寄せ)。DOMには触れない。
  const clampTf = useCallback(() => {
    const t = tfRef.current;
    const sW = stageWRef.current, sH = stageHRef.current;
    const cw = displayWRef.current * t.z, ch = displayHRef.current * t.z;
    t.tx = cw <= sW ? (sW - cw) / 2 : Math.min(0, Math.max(sW - cw, t.tx));
    t.ty = ch <= sH ? (sH - ch) / 2 : Math.min(0, Math.max(sH - ch, t.ty));
  }, []);

  // 実際にDOMへ変形を書き込む(同期)。translate3d でGPU合成に載せ、ズーム%は直接更新。
  const writeTransform = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    clampTf();
    const t = tfRef.current;
    surface.style.transform = `translate3d(${t.tx}px, ${t.ty}px, 0) scale(${t.z})`;
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(t.z * 100)}%`;
  }, [clampTf]);

  // 変形の書き込みを1フレームに1回へまとめる(ジェスチャ中のカクつき防止)。
  const scheduleTransform = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      writeTransform();
    });
  }, [writeTransform]);

  // Reactの状態(ボタン表示用)を最終値に同期。ジェスチャ中は呼ばず、終了時のみ。
  const syncZoomState = useCallback(() => {
    setZoomPct(Math.round(tfRef.current.z * 100));
  }, []);

  // 点 p(stage座標)を固定してズーム。tfRef を書き換えるだけ(DOM/状態には触れない)。
  const applyZoom = useCallback((p: XY, ratio: number) => {
    const t = tfRef.current;
    const nz = clampZ(t.z * ratio);
    const k = nz / t.z;
    t.tx = p.x - (p.x - t.tx) * k;
    t.ty = p.y - (p.y - t.ty) * k;
    t.z = nz;
  }, []);

  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current != null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
  }, []);

  // 指を離した後の慣性スクロール(GoodNotes風のフリック)。
  const startMomentum = useCallback(() => {
    const v = panVelRef.current;
    if (Math.hypot(v.x, v.y) < 0.06) return; // ほぼ静止ならフリックしない
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(32, now - last);
      last = now;
      const t = tfRef.current;
      t.tx += v.x * dt;
      t.ty += v.y * dt;
      const wantX = t.tx, wantY = t.ty;
      clampTf();
      if (t.tx !== wantX) v.x = 0; // 端に当たったらその軸は止める
      if (t.ty !== wantY) v.y = 0;
      const decay = Math.pow(0.94, dt / 16);
      v.x *= decay;
      v.y *= decay;
      writeTransform();
      if (Math.hypot(v.x, v.y) > 0.02) {
        momentumRafRef.current = requestAnimationFrame(step);
      } else {
        momentumRafRef.current = null;
      }
    };
    momentumRafRef.current = requestAnimationFrame(step);
  }, [clampTf, writeTransform]);

  function zoomButton(factor: number) {
    stopMomentum();
    measureStage();
    applyZoom({ x: stageWRef.current / 2, y: stageHRef.current / 2 }, factor);
    writeTransform();
    syncZoomState();
  }
  function resetZoom() {
    stopMomentum();
    tfRef.current = { z: 1, tx: 0, ty: 0 };
    measureStage();
    writeTransform();
    syncZoomState();
  }

  // アンマウント時に保留中のrAFを破棄。
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (momentumRafRef.current != null) cancelAnimationFrame(momentumRafRef.current);
    if (renderRafRef.current != null) cancelAnimationFrame(renderRafRef.current);
  }, []);

  // ---- 現在ページを描画 ----
  const renderPage = useCallback(async () => {
    const doc = pdfRef.current;
    const stage = stageRef.current;
    const pageCanvas = pageCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    const activeCanvas = activeCanvasRef.current;
    if (!doc || !stage || !pageCanvas || !inkCanvas || !activeCanvas) return;

    const page = await doc.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const cap = fullBleed ? 2200 : 1100;
    const maxW = Math.min(stage.clientWidth || 900, cap);
    const scale = maxW / base.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    displayWRef.current = viewport.width;
    displayHRef.current = viewport.height;

    for (const c of [pageCanvas, inkCanvas, activeCanvas]) {
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
    measureStage();
    writeTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, fullBleed, measureStage, writeTransform]);

  useEffect(() => {
    if (ready) renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pageNum]);

  useEffect(() => {
    if (!ready) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      measureStage();
      clearTimeout(t);
      t = setTimeout(() => renderPage(), 150);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", measureStage, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", measureStage, true);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---- ホイール/トラックパッド(デスクトップ) ----
  // Ctrl/⌘+ホイール=カーソル位置を中心にズーム、通常ホイール=スクロール。
  // React の onWheel は passive のことがあり preventDefault が効かないため、ネイティブで登録。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !ready) return;
    let syncT: ReturnType<typeof setTimeout>;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopMomentum();
      if (!stageRectRef.current) measureStage();
      const r = stageRectRef.current!;
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) {
        applyZoom(p, Math.exp(-e.deltaY * 0.01));
      } else {
        const t = tfRef.current;
        t.tx -= e.deltaX;
        t.ty -= e.deltaY;
      }
      scheduleTransform();
      clearTimeout(syncT);
      syncT = setTimeout(syncZoomState, 120); // 落ち着いてから React 状態を同期
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      clearTimeout(syncT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---- ポインタ入力(ネイティブ登録) ----
  // ポイント:
  //  - 開始(pointerdown)は stage で受ける(ツールバー等の外側では始めない)。
  //  - 移動/終了は window で受ける(指やペンが要素外に出ても追える)。
  //  - setPointerCapture は使わない: iPad Safari で速い連続ペンの次の pointerdown を
  //    取りこぼす/遅延させる原因になるため。window 追跡なら捕捉は不要。
  //  - ハンドラは ref から最新設定を読むので再アタッチ不要(deps=[ready])。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !ready) return;
    const opts: AddEventListenerOptions = { passive: false };
    const down = (e: PointerEvent) => onPointerDown(e);
    const move = (e: PointerEvent) => onPointerMove(e);
    const up = (e: PointerEvent) => endPointer(e);
    stage.addEventListener("pointerdown", down, opts);
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("pointerup", up, opts);
    window.addEventListener("pointercancel", up, opts);
    return () => {
      stage.removeEventListener("pointerdown", down, opts);
      window.removeEventListener("pointermove", move, opts);
      window.removeEventListener("pointerup", up, opts);
      window.removeEventListener("pointercancel", up, opts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 手書きをブラウザに自動保存(提出まで保持)。
  function persist() {
    if (!storageKey) return;
    try {
      const arr = [...strokesRef.current.entries()].filter(([, l]) => l.length > 0);
      if (arr.length) localStorage.setItem(storageKey, JSON.stringify(arr));
      else localStorage.removeItem(storageKey);
    } catch {
      /* 保存できなくても描画は継続 */
    }
  }

  // 低遅延キャンバスの 2D コンテキストを取得。desynchronized=true で OS の画面合成を待たずに
  // 描画バッファへ直接書き込み、ペン先への追従遅延を約1フレーム縮める(予測点が無い iPad Safari で特に有効)。
  // getContext の属性は「最初の1回」しか効かないため、ライブ層(ink/active)は必ずこのヘルパ経由で取得する。
  function liveCtx(c: HTMLCanvasElement) {
    return c.getContext("2d", { desynchronized: true }) as CanvasRenderingContext2D;
  }

  // dpr を掛けた状態の 2D コンテキストと CSS px の寸法を返す。
  function preparedCtx(c: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = liveCtx(c);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, dpr, w: displayWRef.current, h: c.height / dpr };
  }

  // ペンの太さ(2/4/7)→ perfect-freehand の size(直径 px)。倍率は書き出し時に使う。
  function penSize(s: Stroke, sizeScale: number) {
    return Math.max(2, s.width * 2) * sizeScale;
  }
  // ストローク点(＋任意の予測点)を perfect-freehand 入力 [x_px, y_px, 筆圧] に変換。
  function pfInput(s: Stroke, w: number, h: number, extra: Point[]) {
    const out: number[][] = [];
    for (const pt of s.points) out.push([pt.x * w, pt.y * h, pt.p == null ? 0.5 : pt.p]);
    for (const pt of extra) out.push([pt.x * w, pt.y * h, pt.p == null ? 0.5 : pt.p]);
    return out;
  }
  // ペン1本を筆圧つきの塗り輪郭(perfect-freehand)で描く。last=確定, extra=予測点(描画のみ)。
  function fillPen(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number, last: boolean, extra: Point[], sizeScale = 1) {
    const input = pfInput(s, w, h, extra);
    if (input.length === 0) return;
    const outline = getStroke(input, { size: penSize(s, sizeScale), thinning: PF.thinning, smoothing: PF.smoothing, streamline: PF.streamline, simulatePressure: PF.simulatePressure, last });
    if (outline.length < 2) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = s.color;
    ctx.fill(new Path2D(strokeToPath(outline)));
  }
  // 消しゴム1本を丸ペンの destination-out で削る(committed に対して)。
  function eraseFull(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
    const pts = s.points;
    if (!pts.length) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    if (pts.length === 1) ctx.lineTo(pts[0].x * w + 0.1, pts[0].y * h + 0.1);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
  // 消しゴムの増分(前回の続き→最新点)。描画中に committed を随時削る。
  function eraseIncremental(s: Stroke) {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const { ctx, w, h } = preparedCtx(inkCanvas);
    const pts = s.points;
    const n = pts.length;
    const start = Math.max(0, drawnIdxRef.current);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(pts[start].x * w, pts[start].y * h);
    if (n === 1) ctx.lineTo(pts[0].x * w + 0.1, pts[0].y * h + 0.1);
    for (let i = start + 1; i < n; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    drawnIdxRef.current = n - 1;
  }

  function clearActive() {
    const a = activeCanvasRef.current;
    if (!a) return;
    const ctx = liveCtx(a);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, a.width, a.height);
  }

  // 全確定ストロークを committed 層へ描き直す(取り消し・消去・ページ切替・再レンダ時のみ)。
  function redrawInk() {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const { ctx, w, h } = preparedCtx(inkCanvas);
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    const strokes = strokesRef.current.get(pageNumRef.current) ?? [];
    for (const s of strokes) {
      if (s.erase) eraseFull(ctx, s, w, h);
      else fillPen(ctx, s, w, h, true, EMPTY_PTS);
    }
    clearActive();
  }

  // 描画中の1本を active 層に毎フレーム再描画(rAF)。予測点で低遅延。ink(確定)は触らない=チラつかない。
  function renderActive() {
    renderRafRef.current = null;
    const s = drawingRef.current;
    const a = activeCanvasRef.current;
    if (!s || s.erase || !a) return;
    const { ctx, w, h } = preparedCtx(a);
    ctx.clearRect(0, 0, a.width, a.height);
    fillPen(ctx, s, w, h, false, predictedRef.current);
  }
  function scheduleActiveRender() {
    if (renderRafRef.current != null) return;
    renderRafRef.current = requestAnimationFrame(renderActive);
  }
  // 確定: 描画中の1本を committed へ焼き込み、active をクリア。
  function commitActive(s: Stroke) {
    if (renderRafRef.current != null) {
      cancelAnimationFrame(renderRafRef.current);
      renderRafRef.current = null;
    }
    const inkCanvas = inkCanvasRef.current;
    if (inkCanvas && !s.erase) {
      const { ctx, w, h } = preparedCtx(inkCanvas);
      fillPen(ctx, s, w, h, true, EMPTY_PTS);
    }
    clearActive();
  }

  // ---- 座標変換 ----
  // 描画中は変形しない(ペン接地でタッチはクリア)ので ink 矩形はストローク開始時にキャッシュし、
  // 点ごとの getBoundingClientRect(=レイアウト再計算による遅延)を避ける。
  function toNorm(clientX: number, clientY: number, pressure?: number): Point {
    const rect = inkRectRef.current ?? inkCanvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      p: pressure != null && pressure > 0 ? pressure : 0.5,
    };
  }
  function toStage(clientX: number, clientY: number): XY {
    // ジェスチャ開始時に実測したキャッシュを使う(移動中の getBoundingClientRect による
    // レイアウト再計算=カクつきを避ける)。未計測なら実測してから使う。
    if (!stageRectRef.current) measureStage();
    const r = stageRectRef.current!;
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
  function startStroke(clientX: number, clientY: number, id: number, isTouch: boolean, pressure: number, timeStamp: number) {
    // 直前のストロークが未完了なら先に確定してから開始(状態の取り違えを防ぐ)。
    if (drawingRef.current) commitActive(drawingRef.current);
    // ストローク中は変形しないので ink 矩形をここで1回だけ実測してキャッシュ。
    inkRectRef.current = inkCanvasRef.current!.getBoundingClientRect();
    const erase = toolRef.current === "eraser";
    const w = widthRef.current;
    const stroke: Stroke = {
      color: colorRef.current,
      width: erase ? Math.max(16, w * 4) : w,
      erase,
      points: [toNorm(clientX, clientY, pressure)],
    };
    drawingRef.current = stroke;
    drawIdRef.current = id;
    drawIsTouchRef.current = isTouch;
    drawnIdxRef.current = 0;
    predictedRef.current = [];
    strokeStartTimeRef.current = timeStamp;
    const list = strokesRef.current.get(pageNumRef.current) ?? [];
    list.push(stroke);
    strokesRef.current.set(pageNumRef.current, list);
    clearActive();
    if (erase) eraseIncremental(stroke); // 消しゴムは committed を即削る
    else scheduleActiveRender(); // ペンは active 層で描画(rAF)
  }
  function cancelStroke() {
    if (!drawingRef.current) return;
    const list = strokesRef.current.get(pageNumRef.current);
    if (list && list[list.length - 1] === drawingRef.current) list.pop();
    drawingRef.current = null;
    drawIdRef.current = null;
    drawIsTouchRef.current = false;
    redrawInk();
    persist();
  }

  function onPointerDown(e: PointerEvent) {
    if (!readyRef.current) return;
    if (e.pointerType === "pen") lastPenTimeRef.current = performance.now();
    stopMomentum(); // 慣性スクロール中のタッチは即停止(GoodNotes同様、触れたら止まる)

    if (e.pointerType === "touch") {
      // 手のひら誤爆対策: ペン使用中、またはペンを使った直後(画数の切れ目)のタッチは無視。
      if (penActiveRef.current || performance.now() - lastPenTimeRef.current < PALM_REJECT_MS) return;
      if (touchesRef.current.size === 0) measureStage(); // ジェスチャ開始時に stage を実測
      const pos = toStage(e.clientX, e.clientY);
      touchesRef.current.set(e.pointerId, pos);
      const count = touchesRef.current.size;
      // penOnly では指では絶対に描かない(スクロール/ズーム専用)。
      const canFingerDraw = !penOnlyRef.current && fingerDrawRef.current;
      if (canFingerDraw && count === 1) {
        // 指で書くモード: 1本指は描画
        e.preventDefault();
        startStroke(e.clientX, e.clientY, e.pointerId, true, e.pressure, e.timeStamp);
      } else {
        // ジェスチャ(パン/ピンチ)。指描画中に2本目が来たら描画を取り消してジェスチャへ
        e.preventDefault(); // ブラウザの選択開始(全選択)を抑止
        if (drawIsTouchRef.current) cancelStroke();
        gestureRef.current = snapshot();
        panSampleRef.current = null; // 慣性用の速度サンプルをリセット
        panVelRef.current = { x: 0, y: 0 };
      }
      return;
    }

    // ペン / マウス → 常に描画。ペンなら手のひら無効化を有効化。
    // ※ setPointerCapture は使わない(iPad Safari で次の pointerdown を取りこぼす)。
    //   代わりに移動/終了を window で追う(上の useEffect)。
    e.preventDefault();
    if (e.pointerType === "pen") penActiveRef.current = true;
    // ペンが触れたらタッチ系のジェスチャ状態はクリア(手のひらのパンを止める)。
    touchesRef.current.clear();
    gestureRef.current = null;
    startStroke(e.clientX, e.clientY, e.pointerId, false, e.pressure, e.timeStamp);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === "pen") lastPenTimeRef.current = performance.now();
    // 描画中ポインタ
    if (drawingRef.current && e.pointerId === drawIdRef.current) {
      e.preventDefault();
      const stroke = drawingRef.current;
      // 取りこぼしを拾って(coalesced)全ての中間点を追加。ここでは「保存」だけ(tldraw方式)。
      const evts = e.getCoalescedEvents?.() ?? [e];
      for (const ev of evts) stroke.points.push(toNorm(ev.clientX, ev.clientY, ev.pressure));
      if (stroke.erase) {
        eraseIncremental(stroke);
      } else {
        // 予測点(次フレームのペン位置)は描画のみ・保存しない。実際の描画は rAF で1回/フレーム。
        predictedRef.current = (e.getPredictedEvents?.() ?? []).map((ev) => toNorm(ev.clientX, ev.clientY, ev.pressure));
        scheduleActiveRender();
      }
      return;
    }
    // タッチ・ジェスチャ(パン/ピンチ)
    if (e.pointerType === "touch" && touchesRef.current.has(e.pointerId)) {
      e.preventDefault();
      touchesRef.current.set(e.pointerId, toStage(e.clientX, e.clientY));
      const snap = snapshot();
      const prev = gestureRef.current;
      if (snap && prev && touchesRef.current.size === (prev.dist > 0 ? 2 : 1)) {
        if (snap.dist > 0 && prev.dist > 0) applyZoom(snap.mid, snap.dist / prev.dist);
        const t = tfRef.current;
        const dx = snap.mid.x - prev.mid.x;
        const dy = snap.mid.y - prev.mid.y;
        t.tx += dx;
        t.ty += dy;
        // 1本指スクロール時のみ、指を離した後のフリック用に速度を計測。
        if (touchesRef.current.size === 1) {
          const now = performance.now();
          const s = panSampleRef.current;
          if (s) {
            const dt = now - s.t;
            if (dt > 0) {
              const v = panVelRef.current;
              // 直近の瞬間速度を指数移動平均でならす。
              v.x = v.x * 0.7 + (dx / dt) * 0.3;
              v.y = v.y * 0.7 + (dy / dt) * 0.3;
            }
          }
          panSampleRef.current = { x: snap.mid.x, y: snap.mid.y, t: now };
        } else {
          panVelRef.current = { x: 0, y: 0 }; // ピンチ中はフリックさせない
        }
        scheduleTransform();
      }
      gestureRef.current = snap;
    }
  }

  function endPointer(e: PointerEvent) {
    if (e.pointerType === "pen") lastPenTimeRef.current = performance.now();
    // 進行中ストロークの pointerup のみ確定。開始より前(古い)の up は無視して二画目を守る。
    if (
      e.pointerId === drawIdRef.current &&
      drawingRef.current &&
      e.timeStamp >= strokeStartTimeRef.current
    ) {
      commitActive(drawingRef.current); // active→committed へ焼き込み、予測分は破棄
      drawingRef.current = null;
      drawIdRef.current = null;
      drawIsTouchRef.current = false;
      inkRectRef.current = null;
      persist();
      // 手書きの「有無」が変わったときだけ再描画する(毎画の重い再レンダーで次画が詰まるのを防ぐ)。
      const nowHasInk = [...strokesRef.current.values()].some((l) => l.length > 0);
      if (nowHasInk !== hadInkRef.current) {
        hadInkRef.current = nowHasInk;
        force((n) => n + 1);
      }
    }
    if (e.pointerType === "pen") penActiveRef.current = false;
    if (touchesRef.current.has(e.pointerId)) {
      touchesRef.current.delete(e.pointerId);
      gestureRef.current = snapshot();
      if (touchesRef.current.size === 0) {
        // 全ての指が離れた: 状態を同期し、勢いがあれば慣性スクロール。
        syncZoomState();
        startMomentum();
        panSampleRef.current = null;
      } else {
        // 指が減った(例: ピンチ→1本指): 速度計測をリセットして残りの指で再計測。
        panSampleRef.current = null;
        panVelRef.current = { x: 0, y: 0 };
      }
    }
  }

  function undo() {
    const list = strokesRef.current.get(pageNum);
    if (list && list.length) {
      list.pop();
      redrawInk();
      persist();
      force((n) => n + 1);
    }
  }
  function clearPage() {
    strokesRef.current.set(pageNum, []);
    redrawInk();
    persist();
    force((n) => n + 1);
  }

  const hasAnyInk = [...strokesRef.current.values()].some((l) => l.length > 0);
  hadInkRef.current = hasAnyInk; // 再描画抑制の基準を現在のレンダー値に同期

  /** 各ページを「PDF描画＋手書き」で1枚のPNGに焼き込んで返す。 */
  async function renderPages(): Promise<{ bytes: Uint8Array; w: number; h: number }[]> {
    const doc = pdfRef.current;
    const out: { bytes: Uint8Array; w: number; h: number }[] = [];
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
        // 画面と同じく: ペンは筆圧塗り輪郭、消しゴムは destination-out(手書きのみ消す)。
        for (const s of strokes) {
          if (s.erase) eraseFull(ictx, { ...s, width: s.width * factor }, canvas.width, canvas.height);
          else fillPen(ictx, s, canvas.width, canvas.height, true, EMPTY_PTS, factor);
        }
        ctx.drawImage(ink, 0, 0);
      }

      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      out.push({ bytes, w: canvas.width, h: canvas.height });
    }
    return out;
  }

  /** 提出ボタン: 採点者の添削は即ダウンロード、生徒提出は確認ダイアログを出す。 */
  function requestSubmit() {
    if (submitting) return;
    if (mode === "markup") {
      void submit();
      return;
    }
    if (!hasAnyInk) {
      toast.error("書き込んでから提出してください。");
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    if (submitting) return;
    setConfirming(false);
    setSubmitting(true);
    try {
      const pages = await renderPages();

      if (mode === "markup") {
        // 採点者の添削: 提出せず、書き込み済みPDFをダウンロード。
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.create();
        for (const pg of pages) {
          const img = await pdf.embedPng(pg.bytes);
          const page = pdf.addPage([pg.w, pg.h]);
          page.drawImage(img, { x: 0, y: 0, width: pg.w, height: pg.h });
        }
        const out = await pdf.save();
        const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${downloadName}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("書き込み済みPDFをダウンロードしました。");
        return;
      }

      const fd = new FormData();
      pages.forEach((pg, i) => fd.append("images", new File([pg.bytes as BlobPart], `page-${i + 1}.png`, { type: "image/png" })));
      await submitAnswer(submissionId!, fd);
      if (storageKey) {
        try { localStorage.removeItem(storageKey); } catch { /* noop */ }
      }
      toast.success(resubmit ? "再提出しました。" : "提出しました。解答解説で答え合わせをしましょう。");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : mode === "markup" ? "ダウンロードに失敗しました。" : "提出に失敗しました。");
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
          <span ref={zoomLabelRef} className="annot-zoom-val">{zoomPct}%</span>
          <button type="button" className="annot-btn" onClick={() => zoomButton(1.25)} aria-label="拡大">＋</button>
          <button type="button" className="annot-btn" onClick={resetZoom}>等倍</button>
        </div>
        <div className="annot-edit">
          {penOnly ? (
            <span className="annot-penonly" title="ペン専用。手のひらが当たっても書き込まれません。指はスクロール／ズームに使えます。">🖐 手のひら無効(ペン専用)</span>
          ) : (
            <button type="button" className={`annot-btn${fingerDraw ? " on" : ""}`} onClick={() => setFingerDraw((v) => !v)} title="指・ペンで書く / 手のひら無効(ペンのみ)">
              {fingerDraw ? "✍️ 指・ペンで書く" : "🖐 手のひら無効"}
            </button>
          )}
          <button type="button" className="annot-btn" onClick={undo}>↩ 戻す</button>
          <button type="button" className="annot-btn" onClick={clearPage}>消去</button>
        </div>
        {mode === "submit" && (
          <div className="annot-top-submit">
            <button type="button" className="btn-primary" onClick={requestSubmit} disabled={!ready || submitting}>
              {submitting ? "提出中…" : resubmit ? "✓ 再提出" : "✓ 提出する"}
            </button>
          </div>
        )}
      </div>

      <div ref={stageRef} className="annot-stage">
        {!ready && <div className="annot-loading">読み込み中…</div>}
        {/* ポインタ入力は stage にネイティブ登録(上の useEffect)。ここでは props で受けない。 */}
        <div ref={surfaceRef} className="annot-surface">
          <div className="annot-canvas-wrap">
            <canvas ref={pageCanvasRef} className="annot-page" />
            <canvas ref={inkCanvasRef} className="annot-ink" />
            <canvas ref={activeCanvasRef} className="annot-active" />
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
        <button type="button" className="btn-primary big" onClick={requestSubmit} disabled={!ready || submitting}>
          {submitting
            ? (mode === "markup" ? "作成中…" : "提出中…")
            : mode === "markup"
              ? "⬇ 書き込み済みPDFをダウンロード"
              : resubmit
                ? "✓ 書き込んで再提出する"
                : "✓ 完了して提出する"}
        </button>
        {mode === "submit" && !hasAnyInk && ready && <span className="muted" style={{ marginLeft: 10 }}>書き込んでから提出してください。</span>}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        {penOnly
          ? "ペン（Apple Pencil など）で書きます。手のひらが当たっても書き込まれません。指では1本でスクロール、2本指のピンチで拡大縮小できます。書き込みは自動保存され、提出するまで消えません。"
          : "タッチペン・指のどちらでも書けます。2本指でスクロール、ピンチで拡大縮小。Apple Pencil を使うときは「手のひら無効」にすると手が当たっても書けません。書き込みは自動保存され、提出するまで消えません。"}
      </p>

      {confirming && (
        <div className="annot-confirm" role="dialog" aria-modal="true" onClick={() => setConfirming(false)}>
          <div className="annot-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="annot-confirm-title">{resubmit ? "再提出しますか？" : "本当に提出しますか？"}</div>
            <p className="annot-confirm-body">
              提出すると先生に答案が送られ、すぐに解答解説で答え合わせ（自己採点）ができます。
            </p>
            <div className="annot-confirm-actions">
              <button type="button" className="annot-btn" onClick={() => setConfirming(false)} disabled={submitting}>もどる</button>
              <button type="button" className="btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? "提出中…" : "はい、提出する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
