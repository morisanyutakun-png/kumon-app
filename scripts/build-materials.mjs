// =============================================================================
// 算数プリントのビルド
//   materials-tex/manifest.mjs の各エントリから
//     <id>.tex      (問題版)  -> <id>.pdf
//     <id>_kai.tex  (解答版)  -> <id>_kai.pdf
//   を生成し lualatex (luatexja / haranoaji) でコンパイルする。
//   デザインは中高部の iplus-sheet / iplus-figs を継承(小学部プリセット)。
//
//   実行: node scripts/build-materials.mjs           (全プリント)
//         node scripts/build-materials.mjs g1-03 g1-09 (指定IDのみ)
//
//   出力: materials-tex/dist/*.pdf
// =============================================================================
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEXDIR = join(ROOT, "materials-tex");
const WORK = join(TEXDIR, ".work");
const DIST = join(TEXDIR, "dist");
const TEXBIN = "/Library/TeX/texbin";
const ENV = { ...process.env, PATH: `${TEXBIN}:${process.env.PATH}` };
// .work へコピーする共有アセット(スタイル + 小学部ロゴ)。
const ASSETS = ["kumonprint.sty", "iplus-sheet.sty", "iplus-figs.sty", "logo_sho.png"];

function texDoc(body, { answer }) {
  const ans = answer ? "\\def\\ANSWER{1}\n" : "";
  // lualatex + luatexja-preset(haranoaji)。本文は少し大きめ(小学部)。
  return `${ans}\\documentclass[a4paper,12pt]{article}
\\usepackage[haranoaji,deluxe]{luatexja-preset}
\\usepackage{kumonprint}
\\useflow
\\begin{document}
${body}
\\end{document}
`;
}

// 1ページ分の本文を組む。idx は 0始まり、total は総ページ数。
//   ・ヘッダー/フッター(ロゴ)は \useflow が各ページ自動描画。
//   ・\setsheet{単元}{／配点}{k/total} で走り出し見出しを更新。
//   ・なまえ欄は各ページ上部、めあては1ページ目、応援は最終ページ。
function onePage(p, body, idx, total) {
  const goal = idx === 0 && p.goal ? `\\kpgoal{${p.goal}}\n` : "";
  const points = p.points ?? 10;
  const pageLabel = total > 1 ? `${idx + 1}/${total}` : "1/1";
  const finish = idx === total - 1 ? "\\kpfinish\n" : "";
  const title = `${p.grade}年 ／ ${p.title}`;
  return `\\setsheet{${title}}{／${points}}{${pageLabel}}\\thispagestyle{ipflow}
\\kpnamebar
${goal}${body}
\\par\\vspace{\\stretch{1}}
${finish}`;
}

// プリント全体(複数ページ対応)。p.pages があれば各要素を1ページとして
// \clearpage で区切る。なければ p.body を1ページとして従来どおり扱う。
function pageBody(p) {
  const pages = Array.isArray(p.pages) && p.pages.length ? p.pages : [p.body];
  return pages.map((body, i) => onePage(p, body, i, pages.length)).join("\n\\clearpage\n");
}

function compile(stem) {
  // lualatex を 2 回(fancyhdr / 参照の安定のため)。PDF を直接出力。
  for (let i = 0; i < 2; i++) {
    execFileSync("lualatex", ["-interaction=nonstopmode", "-halt-on-error", `${stem}.tex`], {
      cwd: WORK,
      env: ENV,
      stdio: ["ignore", "ignore", "pipe"],
    });
  }
}

async function main() {
  const { prints } = await import(join(TEXDIR, "manifest.mjs"));
  const only = process.argv.slice(2);
  const targets = only.length ? prints.filter((p) => only.includes(p.id)) : prints;
  if (targets.length === 0) {
    console.error("対象プリントがありません。", only);
    process.exit(1);
  }

  // texbin の存在確認
  if (!existsSync(join(TEXBIN, "lualatex"))) {
    console.error(`lualatex が見つかりません: ${TEXBIN}`);
    process.exit(1);
  }

  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(DIST, { recursive: true });
  // スタイル + ロゴを作業ディレクトリへ
  for (const a of ASSETS) copyFileSync(join(TEXDIR, a), join(WORK, a));

  let ok = 0;
  const failed = [];
  for (const p of targets) {
    const body = pageBody(p);
    for (const [suffix, answer] of [["", false], ["_kai", true]]) {
      const stem = `${p.id}${suffix}`;
      writeFileSync(join(WORK, `${stem}.tex`), texDoc(body, { answer }), "utf8");
      try {
        compile(stem);
        copyFileSync(join(WORK, `${stem}.pdf`), join(DIST, `${stem}.pdf`));
        ok++;
      } catch (e) {
        let log = String(e);
        try {
          const { readFileSync } = await import("node:fs");
          const full = readFileSync(join(WORK, `${stem}.log`), "utf8");
          const m = full.split("\n").filter((l) => /^!|Error|Undefined|Runaway|^l\.\d/.test(l));
          log = (m.length ? m : full.split("\n").slice(-18)).join("\n");
        } catch {}
        failed.push({ stem, log });
        console.error(`\n✗ ${stem} のコンパイルに失敗:\n${log}`);
      }
    }
    console.log(`✓ ${p.id}  ${p.title}`);
  }

  // クリーンアップ(.work の中間ファイルは残してデバッグ可能にしておく)
  const pdfs = readdirSync(DIST).filter((f) => f.endsWith(".pdf"));
  console.log(`\n完了: ${ok} PDF を生成 (${DIST})  / 失敗 ${failed.length}`);
  console.log(`dist 内 PDF 数: ${pdfs.length}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
