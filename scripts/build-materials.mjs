// =============================================================================
// 算数プリントのビルド
//   materials-tex/manifest.mjs の各エントリから
//     <id>.tex      (問題版)  -> <id>.pdf
//     <id>_kai.tex  (解答版)  -> <id>_kai.pdf
//   を生成し uplatex + dvipdfmx でコンパイルする。
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

function texDoc(body, { answer }) {
  const ans = answer ? "\\def\\ANSWER{1}\n" : "";
  return `${ans}\\documentclass[dvipdfmx,uplatex,a4paper,11pt]{jsarticle}
\\usepackage{kumonprint}
\\begin{document}
${body}
\\end{document}
`;
}

function pageBody(p) {
  const goal = p.goal ? `\\kpgoal{${p.goal}}\n` : "";
  return `\\kpheader{さんすう ${p.grade}年}{${p.title}}{${p.subtitle}}
${goal}${p.body}
\\kpfinish
\\kpfooter{さんすう ${p.grade}年 ｜ ${p.title}}`;
}

function compile(stem) {
  // uplatex を 1 回 (.aux 安定のため必要なら 2 回) → dvipdfmx
  for (let i = 0; i < 2; i++) {
    execFileSync("uplatex", ["-interaction=nonstopmode", "-halt-on-error", `${stem}.tex`], {
      cwd: WORK,
      env: ENV,
      stdio: ["ignore", "ignore", "pipe"],
    });
  }
  execFileSync("dvipdfmx", ["-q", `${stem}.dvi`], { cwd: WORK, env: ENV, stdio: ["ignore", "ignore", "pipe"] });
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
  if (!existsSync(join(TEXBIN, "uplatex"))) {
    console.error(`uplatex が見つかりません: ${TEXBIN}`);
    process.exit(1);
  }

  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(DIST, { recursive: true });
  // .sty を作業ディレクトリへ
  copyFileSync(join(TEXDIR, "kumonprint.sty"), join(WORK, "kumonprint.sty"));

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
        const log = e.stderr ? e.stderr.toString().split("\n").slice(-12).join("\n") : String(e);
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
