"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 提出後の自己採点ビュー。自分の答案(左)と解答・解説(右)を同一画面に並べて見比べる。
 * ワイド画面=左右2ペイン。ナロー(スマホ)=タブ切替で1ペインずつ全幅。各ペインは独立スクロール。
 * 解答PDFは pdfjs でインライン描画(iPad Safari は iframe のPDF埋め込みが不安定なため)。
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
        <div className="sg-pane-body">{children}</div>
      </section>

      <section className="sg-pane sg-pane-solution" aria-label="解答・解説">
        <div className="sg-pane-head">📕 解答・解説</div>
        <div className="sg-pane-body">
          {solutions.map((s) => (
            <div key={s.id} className="sg-sol-file">
              <div className="sg-sol-name">
                📄 {s.fileName}
                <a href={`/api/files/material/${s.id}`} target="_blank" rel="noreferrer" className="db-badge">別タブで開く</a>
                <a href={`/api/files/material/${s.id}?dl=1`} className="db-badge">保存する</a>
              </div>
              <SolutionPdf url={`/api/files/material/${s.id}`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 解答PDFをペイン幅に合わせて全ページ縦積みで描画(読み取り専用)。回転や表示切替で幅が変わったら描き直す。 */
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
      if (cssW < 40) return; // 非表示(タブ裏)/未レイアウトの間は描画しない
      if (Math.abs(cssW - lastW) < 2) return; // 幅がほぼ同じなら描き直さない
      lastW = cssW;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const frag = document.createDocumentFragment();
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (cancelled || lastW !== cssW) return; // 途中で幅が変わった=新しい描画に任せて中断
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: cssW / base.width });
        const canvas = document.createElement("canvas");
        canvas.className = "sg-pdf-page";
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (cancelled || lastW !== cssW) return;
        frag.appendChild(canvas);
      }
      if (cancelled) return;
      pages.replaceChildren(frag);
      setStatus("ready");
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(doRender);
    };
    // 幅の変化(初期レイアウト・回転・タブ表示化)で描き直す。
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
        <div className="sg-pdf-note r-NG">解答を表示できませんでした。「別タブで開く」からご覧ください。</div>
      )}
      <div ref={pagesRef} className="sg-pdf-pages" />
    </div>
  );
}
