"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 提出後の自己採点ビュー。自分の答案(左)と解答・解説(右)を同一画面に並べて見比べる。
 * ワイド画面=左右2ペイン。ナロー(スマホ)=タブ切替で1ペインずつ全幅。
 * 各ペインは独立して ピンチ / ダブルタップ / ± ボタン / ホイール で拡大・パンできる(両方見ながら復習)。
 * 解答PDFは pdfjs で高解像度オーバーサンプル描画(iframe埋め込みが不安定な iPad Safari 対策も兼ねる)。
 */
export function SelfGradeSplit({
  solutions,
  children,
}: {
  solutions: { id: string; fileName: string }[];
  /** 左ペインの中身(提出した答案画像)。 */
  children: ReactNode;
}) {
  const [pane, setPane] = useState<"answer" | "solution">("answer");
  return (
    <div className="sg-split" data-active={pane}>
      {/* スマホ幅でのみ表示されるタブ(ワイドではCSSで非表示) */}
      <div className="sg-tabs" role="tablist" aria-label="表示切替">
        <button
          type="button" role="tab" aria-selected={pane === "answer"}
          className={`sg-tab${pane === "answer" ? " on" : ""}`}
          onClick={() => setPane("answer")}
        >📝 自分の答案</button>
        <button
          type="button" role="tab" aria-selected={pane === "solution"}
          className={`sg-tab${pane === "solution" ? " on" : ""}`}
          onClick={() => setPane("solution")}
        >📕 解答・解説</button>
      </div>

      <section className="sg-pane sg-pane-answer" aria-label="自分の答案">
        <div className="sg-pane-head">📝 自分の答案</div>
        <div className="sg-pane-body">
          <ZoomPane>{children}</ZoomPane>
        </div>
      </section>

      <section className="sg-pane sg-pane-solution" aria-label="解答・解説">
        <div className="sg-pane-head">
          📕 解答・解説
          {solutions.map((s) => (
            <span key={s.id} className="sg-sol-links">
              <a href={`/api/files/material/${s.id}`} target="_blank" rel="noreferrer" className="db-badge">別タブ</a>
              <a href={`/api/files/material/${s.id}?dl=1`} className="db-badge">保存</a>
            </span>
          ))}
        </div>
        <div className="sg-pane-body">
          <ZoomPane>
            {solutions.map((s) => (
              <SolutionPdf key={s.id} url={`/api/files/material/${s.id}`} />
            ))}
          </ZoomPane>
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ズーム/パン ビューポート(読み取り専用)
// -----------------------------------------------------------------------------
const MIN_Z = 1; // フィット幅より小さくはしない
const MAX_Z = 5;

/** 子要素を、ピンチ/ダブルタップ/ホイール/±ボタンで拡大・パンできる枠に収める。 */
function ZoomPane({ children }: { children: ReactNode }) {
  const vpRef = useRef<HTMLDivElement>(null); // ビューポート(固定枠・overflow hidden)
  const surfRef = useRef<HTMLDivElement>(null); // 変形する層
  const tf = useRef({ z: 1, tx: 0, ty: 0 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ mid: { x: number; y: number }; dist: number } | null>(null);
  const raf = useRef<number | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const lastTap = useRef(0);
  const [zPct, setZPct] = useState(100);

  useEffect(() => {
    const vp = vpRef.current;
    const surf = surfRef.current;
    if (!vp || !surf) return;
    const opts: AddEventListenerOptions = { passive: false };

    const measure = () => { rect.current = vp.getBoundingClientRect(); };
    const local = (e: { clientX: number; clientY: number }) => {
      if (!rect.current) measure();
      const r = rect.current!;
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const snapshot = () => {
      const pts = [...pointers.current.values()];
      if (pts.length === 0) return null;
      if (pts.length === 1) return { mid: pts[0], dist: 0 };
      const [a, b] = pts;
      return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    const clamp = () => {
      const t = tf.current;
      const vw = vp.clientWidth, vh = vp.clientHeight;
      const cw = surf.offsetWidth * t.z, ch = surf.offsetHeight * t.z;
      t.tx = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, t.tx));
      t.ty = ch <= vh ? 0 : Math.min(0, Math.max(vh - ch, t.ty)); // 縦は上詰め
    };
    const write = () => {
      raf.current = null;
      clamp();
      const t = tf.current;
      surf.style.transform = `translate3d(${t.tx}px, ${t.ty}px, 0) scale(${t.z})`;
    };
    const schedule = () => { if (raf.current == null) raf.current = requestAnimationFrame(write); };
    const syncLabel = () => setZPct(Math.round(tf.current.z * 100));
    const zoomAt = (px: number, py: number, ratio: number) => {
      const t = tf.current;
      const nz = Math.min(MAX_Z, Math.max(MIN_Z, t.z * ratio));
      const k = nz / t.z;
      t.tx = px - (px - t.tx) * k;
      t.ty = py - (py - t.ty) * k;
      t.z = nz;
    };

    const down = (e: PointerEvent) => {
      measure();
      pointers.current.set(e.pointerId, local(e));
      gesture.current = snapshot();
      if (pointers.current.size === 1) {
        // ダブルタップ / ダブルクリックで 等倍 ⇄ 2.5倍 をトグル。
        const now = performance.now();
        if (now - lastTap.current < 300) {
          const p = local(e);
          if (tf.current.z > 1.01) tf.current = { z: 1, tx: 0, ty: 0 };
          else zoomAt(p.x, p.y, 2.5);
          schedule(); syncLabel();
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      e.preventDefault();
      pointers.current.set(e.pointerId, local(e));
      const snap = snapshot();
      const prev = gesture.current;
      if (snap && prev) {
        if (snap.dist > 0 && prev.dist > 0) zoomAt(snap.mid.x, snap.mid.y, snap.dist / prev.dist);
        const t = tf.current;
        t.tx += snap.mid.x - prev.mid.x;
        t.ty += snap.mid.y - prev.mid.y;
        schedule();
      }
      gesture.current = snap;
    };
    const up = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      gesture.current = snapshot();
      syncLabel();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      measure();
      const p = local(e);
      if (e.ctrlKey || e.metaKey) {
        zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.01)); // ⌘/Ctrl+ホイール=ズーム
      } else {
        const t = tf.current; // 通常ホイール=パン(スクロール)
        t.tx -= e.deltaX; t.ty -= e.deltaY;
      }
      schedule();
      syncLabel();
    };

    vp.addEventListener("pointerdown", down, opts);
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("pointerup", up, opts);
    window.addEventListener("pointercancel", up, opts);
    vp.addEventListener("wheel", wheel, opts);

    // ボタン操作用に window へ小さなAPIをぶら下げず、ref経由で呼べるよう保持。
    vp.dataset.zoomReady = "1";
    (vp as any)._zoomBtn = (ratio: number) => { measure(); zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, ratio); schedule(); syncLabel(); };
    (vp as any)._zoomReset = () => { tf.current = { z: 1, tx: 0, ty: 0 }; schedule(); syncLabel(); };

    return () => {
      vp.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      vp.removeEventListener("wheel", wheel);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  const btn = (ratio: number) => (vpRef.current as any)?._zoomBtn?.(ratio);
  const reset = () => (vpRef.current as any)?._zoomReset?.();

  return (
    <div className="zpane">
      <div className="zpane-ctrls">
        <button type="button" onClick={() => btn(1 / 1.4)} aria-label="縮小">－</button>
        <button type="button" onClick={reset} title="等倍に戻す">{zPct}%</button>
        <button type="button" onClick={() => btn(1.4)} aria-label="拡大">＋</button>
      </div>
      {/* パン中に答案画像リンクが誤って開かないようクリック既定動作を抑止(拡大はダブルタップ/ボタンで) */}
      <div ref={vpRef} className="zpane-vp" onClickCapture={(e) => e.preventDefault()}>
        <div ref={surfRef} className="zpane-surf">{children}</div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 解答PDF(読み取り専用・高解像度)
// -----------------------------------------------------------------------------
/** 解答PDFをフィット幅で全ページ縦積み描画。拡大時もくっきりするようオーバーサンプルする。 */
function SolutionPdf({ url }: { url: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let doc: any = null;
    let lastW = 0;
    let raf = 0;
    const pages = pagesRef.current;
    if (!pages) return;

    const doRender = async () => {
      if (!doc || cancelled) return;
      const cssW = pages.clientWidth;
      if (cssW < 40) return; // 非表示/未レイアウト中は描かない
      if (Math.abs(cssW - lastW) < 2) return; // 幅がほぼ同じなら描き直さない(ズームは transform なので再描画不要)
      lastW = cssW;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const OVER = 2; // 拡大しても粗くならないよう表示解像度の2倍で焼く
      const frag = document.createDocumentFragment();
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (cancelled || lastW !== cssW) return; // 途中で幅が変わった=新しい描画に任せて中断
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: cssW / base.width });
        // バッキングは表示の dpr*OVER 倍(ただし 2200px で頭打ち=メモリ保護)。
        const backW = Math.min(vp.width * dpr * OVER, 2200);
        const q = backW / vp.width;
        const canvas = document.createElement("canvas");
        canvas.className = "sg-pdf-page";
        canvas.width = Math.floor(vp.width * q);
        canvas.height = Math.floor(vp.height * q);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(q, q);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (cancelled || lastW !== cssW) return;
        frag.appendChild(canvas);
      }
      if (cancelled) return;
      pages.replaceChildren(frag);
      setStatus("ready");
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(doRender); };
    const ro = new ResizeObserver(schedule);
    ro.observe(pages);

    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        schedule();
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [url]);

  return (
    <div className="sg-pdf">
      {status === "loading" && <div className="sg-pdf-note">解答を読み込み中…</div>}
      {status === "error" && (
        <div className="sg-pdf-note r-NG">解答を表示できませんでした。「別タブ」からご覧ください。</div>
      )}
      <div ref={pagesRef} className="sg-pdf-pages" />
    </div>
  );
}
