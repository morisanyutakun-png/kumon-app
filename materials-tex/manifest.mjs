// =============================================================================
// 算数プリント教材の定義 (manifest)
//
// 1 プリント = 1 教材。各エントリから「問題版」と「解答版」の TeX/PDF を生成し、
// seed-math-materials.ts で materials / units / material_files に登録する。
//
// LaTeX 本文は kumonprint.sty のマクロを使う:
//   \kpsection{見出し}            セクション見出し
//   \begin{kpgrid}{列数} ... end  計算問題のグリッド
//   \kpitem{(1)}{$3+4=$}{7}       1問(式と答え。答えは解答版で赤字表示)
//   \kpbox{答え}                  解答欄の箱(問題版は空欄)
//   \kpblank{答え}                下線の空欄(問題版)/赤字(解答版)
//   \kpclock{じ}{ふん}            アナログ時計
//
// 問題は再現性のため、id から決めたシードの擬似乱数で決定的に生成する。
// =============================================================================

// --- 決定的乱数 (mulberry32) ---
function rngFromString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

// --- LaTeX 組み立てヘルパ ---
function grid(items, cols = 2) {
  return `\\begin{kpgrid}{${cols}}\n${items.join("\n")}\n\\end{kpgrid}`;
}
function calcItems(probs) {
  return probs.map((p, i) => `\\kpitem{(${i + 1})}{$${p.expr}$}{${p.ans}}`);
}
// 重複を避けつつ count 問つくる
function uniqueProbs(rng, count, make) {
  const seen = new Set();
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const p = make();
    if (!p) continue;
    if (seen.has(p.expr)) continue;
    seen.add(p.expr);
    out.push(p);
  }
  return out;
}

// --- 算数の問題ジェネレータ ---
function genAdd(rng, count, { maxSum, carry = null }) {
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, 1, maxSum - 1);
    const b = ri(rng, 1, maxSum - a);
    if (a + b > maxSum || a + b < 2) return null;
    if (carry === false && (a % 10) + (b % 10) >= 10) return null;
    if (carry === true && a + b <= 10) return null;
    return { expr: `${a}+${b}=`, ans: a + b };
  });
}
function genAddCarry(rng, count, { maxSum }) {
  // くり上がり: 1桁+1桁 で 和が 11〜maxSum
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, 2, 9);
    const b = ri(rng, 11 - a > 1 ? 11 - a : 2, 9);
    if (a + b < 11 || a + b > maxSum) return null;
    return { expr: `${a}+${b}=`, ans: a + b };
  });
}
function genSub(rng, count, { max }) {
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, 2, max);
    const b = ri(rng, 1, a - 1);
    if (a - b < 1) return null;
    return { expr: `${a}-${b}=`, ans: a - b };
  });
}
function genSubBorrow(rng, count, { max }) {
  // くり下がり: (11〜max) - (1桁) で 一の位がくり下がる
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, 11, max);
    const ones = a % 10;
    const b = ri(rng, ones + 1, 9);
    if (a - b < 1 || b <= ones) return null;
    return { expr: `${a}-${b}=`, ans: a - b };
  });
}

// =============================================================================
// プリント一覧 (小学1年)
// =============================================================================
function buildG1() {
  const P = [];
  const add = (def) => P.push({ grade: 1, subject: "算数", ...def });

  // ① 10までのかず ---------------------------------------------------------
  add({
    id: "g1-01",
    unitNo: 1,
    name: "算数1年① 10までの かず",
    title: "10までの かず",
    subtitle: "かずを かぞえて すうじで かこう",
    goal: "1〜10 の数を、ものの個数と対応させて数え、数字で書けるようにします。",
    body: (() => {
      const rng = rngFromString("g1-01");
      const dotsRow = (n) =>
        `\\textcolor{kpblue}{${"$\\bullet$ ".repeat(n)}}\\quad $\\rightarrow$\\quad \\kpbox{${n}} こ`;
      const counts = [3, 5, 4, 7, 6, 9, 8, 10];
      const items = counts
        .map((n, i) => `\\kpitemx{(${i + 1})}{${dotsRow(n)}}`)
        .join("\n");
      const seq = uniqueProbs(rng, 4, () => {
        const a = ri(rng, 1, 6);
        return { expr: `${a},\\ ${a + 1},\\ \\square,\\ ${a + 3}`, ans: a + 2 };
      });
      return [
        "\\kpsection{いくつ ありますか。すうじで かきましょう}",
        `\\begin{kpgrid}{2}\n${items}\n\\end{kpgrid}`,
        "\\kpsection{$\\square$ に あう かずを かきましょう}",
        grid(
          seq.map((p, i) => `\\kpitem{(${i + 1})}{$${p.expr}$}{${p.ans}}`),
          2,
        ),
      ].join("\n");
    })(),
  });

  // ② いくつといくつ -------------------------------------------------------
  add({
    id: "g1-02",
    unitNo: 2,
    name: "算数1年② いくつと いくつ",
    title: "いくつと いくつ",
    subtitle: "5〜10 の かずを 2つに わける",
    goal: "10 までの数の合成・分解(いくつといくつ)を身につけ、たし算・ひき算の素地をつくります。",
    body: (() => {
      const rng = rngFromString("g1-02");
      // 「N は A と □」型
      const partOf = uniqueProbs(rng, 8, () => {
        const n = ri(rng, 5, 10);
        const a = ri(rng, 1, n - 1);
        return { expr: `${n}\\ \\text{は}\\ ${a}\\ \\text{と}`, ans: n - a };
      });
      // 「□ と B で N」型
      const makeN = uniqueProbs(rng, 6, () => {
        const n = ri(rng, 5, 10);
        const b = ri(rng, 1, n - 1);
        return { expr: `\\kpbox{${n - b}}\\ \\text{と}\\ ${b}\\ \\text{で}\\ ${n}`, ans: null };
      });
      return [
        "\\kpsection{あう かずを かきましょう}",
        grid(
          partOf.map((p, i) => `\\kpitem{(${i + 1})}{$${p.expr}$}{${p.ans}}`),
          2,
        ),
        "\\kpsection{$\\square$ に あう かずを かきましょう}",
        grid(
          makeN.map((p, i) => `\\kpitemx{(${i + 1})}{$${p.expr}$}`),
          2,
        ),
      ].join("\n");
    })(),
  });

  // ③ あわせていくつ (たしざん①) ------------------------------------------
  add({
    id: "g1-03",
    unitNo: 3,
    name: "算数1年③ あわせて いくつ (たしざん 1)",
    title: "たしざん (1)",
    subtitle: "わが 6 までの たしざん",
    goal: "合併・増加の場面のたし算。和が 6 までの 1 桁どうしのたし算を確実にします。",
    body: (() => {
      const rng = rngFromString("g1-03");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAdd(rng, 18, { maxSum: 6 })), 3),
      ].join("\n");
    })(),
  });

  // ④ ふえるといくつ (たしざん②) ------------------------------------------
  add({
    id: "g1-04",
    unitNo: 4,
    name: "算数1年④ ふえると いくつ (たしざん 2)",
    title: "たしざん (2)",
    subtitle: "わが 10 までの たしざん",
    goal: "和が 10 までのたし算。くり上がりのない 1 桁どうしを反復します。",
    body: (() => {
      const rng = rngFromString("g1-04");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAdd(rng, 21, { maxSum: 10 })), 3),
      ].join("\n");
    })(),
  });

  // ⑤ のこりはいくつ (ひきざん①) ------------------------------------------
  add({
    id: "g1-05",
    unitNo: 5,
    name: "算数1年⑤ のこりは いくつ (ひきざん 1)",
    title: "ひきざん (1)",
    subtitle: "10 までの ひきざん",
    goal: "求残・求差のひき算。10 までの数からのくり下がりのないひき算を確実にします。",
    body: (() => {
      const rng = rngFromString("g1-05");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genSub(rng, 21, { max: 10 })), 3),
      ].join("\n");
    })(),
  });

  // ⑥ ちがいはいくつ (ひきざん②) ------------------------------------------
  add({
    id: "g1-06",
    unitNo: 6,
    name: "算数1年⑥ ちがいは いくつ (ひきざん 2)",
    title: "ひきざん (2)",
    subtitle: "10 までの ひきざん (ちがい)",
    goal: "2 つの数のちがいを求めるひき算。0 のひき算もふくめて反復します。",
    body: (() => {
      const rng = rngFromString("g1-06");
      const probs = genSub(rng, 18, { max: 10 });
      // 0のひき算を少し混ぜる
      probs.push({ expr: "6-0=", ans: 6 }, { expr: "9-9=", ans: 0 }, { expr: "8-0=", ans: 8 });
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(probs), 3),
      ].join("\n");
    })(),
  });

  // ⑦ なんばんめ -----------------------------------------------------------
  add({
    id: "g1-07",
    unitNo: 7,
    name: "算数1年⑦ なんばんめ",
    title: "なんばんめ",
    subtitle: "じゅんばんと かず",
    goal: "順序数(なんばんめ)と集合数(なんこ)のちがいを理解します。前後・左右の位置の表し方を学びます。",
    body: (() => {
      const animals = "$\\bigstar\\ \\bigstar\\ \\bigstar\\ \\bigstar\\ \\bigstar\\ \\bigstar\\ \\bigstar$";
      return [
        "\\kpsection{ひだりから かぞえて こたえましょう}",
        `\\begin{center}{\\Large ${animals}}\\end{center}\\vspace{1mm}`,
        "{\\large ★が ひだりから ならんで います。}\\par\\vspace{4mm}",
        "\\kpqfull{(1)}{ひだりから 3ばんめの ★を ○で かこみましょう。それは みぎから かぞえると なんばんめですか。 \\quad こたえ \\kpbox{5} ばんめ}",
        "\\kpqfull{(2)}{★は ぜんぶで なんこ ありますか。 \\quad こたえ \\kpbox{7} こ}",
        "\\kpqfull{(3)}{ひだりから 5こを ○で かこむと、のこりは なんこですか。 \\quad こたえ \\kpbox{2} こ}",
        "\\kpqfull{(4)}{みぎから 2ばんめは、ひだりから かぞえると なんばんめですか。 \\quad こたえ \\kpbox{6} ばんめ}",
      ].join("\n");
    })(),
  });

  // ⑧ 20までのかず --------------------------------------------------------
  add({
    id: "g1-08",
    unitNo: 8,
    name: "算数1年⑧ 20までの かず",
    title: "20までの かず",
    subtitle: "くり上がりの ない たし・ひき",
    goal: "20 までの数の構成(10 と いくつ)。10+□、1□+□、1□−□ のくり上がり・くり下がりのない計算を反復します。",
    body: (() => {
      const rng = rngFromString("g1-08");
      const t10 = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 1, 9);
        return { expr: `10+${a}=`, ans: 10 + a };
      });
      const add2 = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 11, 18);
        const b = ri(rng, 1, 19 - a);
        if (a + b > 19 || (a % 10) + b >= 10) return null;
        return { expr: `${a}+${b}=`, ans: a + b };
      });
      const sub2 = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 12, 19);
        const b = ri(rng, 1, a % 10);
        if (a - b < 10) return null;
        return { expr: `${a}-${b}=`, ans: a - b };
      });
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems([...t10, ...add2, ...sub2]), 3),
      ].join("\n");
    })(),
  });

  // ⑨ とけい --------------------------------------------------------------
  add({
    id: "g1-09",
    unitNo: 9,
    name: "算数1年⑨ とけい (なんじ・なんじはん)",
    title: "とけい",
    subtitle: "なんじ・なんじはん",
    goal: "「何時」「何時半」の時計を読みます。日常生活と時刻を結びつけます。",
    body: (() => {
      const clocks = [
        [3, 0, "3じ"],
        [8, 0, "8じ"],
        [6, 30, "6じはん"],
        [10, 0, "10じ"],
        [1, 30, "1じはん"],
        [12, 0, "12じ"],
      ];
      const cell = ([h, m, ans], i) =>
        `\\begin{minipage}[t]{0.3\\linewidth}\\centering (${i + 1})\\par \\kpclock{${h}}{${m}}\\par\\vspace{1mm}\\kpbox{${ans}}\\end{minipage}`;
      return [
        "\\kpsection{いま なんじですか。とけいを よみましょう}",
        "\\begin{center}",
        clocks.slice(0, 3).map(cell).join("\\hfill"),
        "\\par\\vspace{6mm}",
        clocks
          .slice(3)
          .map((c, i) => cell(c, i + 3))
          .join("\\hfill"),
        "\\end{center}",
      ].join("\n");
    })(),
  });

  // ⑩ 3つのかずのけいさん -------------------------------------------------
  add({
    id: "g1-10",
    unitNo: 10,
    name: "算数1年⑩ 3つの かずの けいさん",
    title: "3つの かずの けいさん",
    subtitle: "たしたり ひいたり",
    goal: "3 口の加減(増えてから減る、続けて増える等)を、前から順に計算します。",
    body: (() => {
      const rng = rngFromString("g1-10");
      const addadd = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 1, 4), b = ri(rng, 1, 4), c = ri(rng, 1, 4);
        if (a + b + c > 10) return null;
        return { expr: `${a}+${b}+${c}=`, ans: a + b + c };
      });
      const subsub = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 7, 10), b = ri(rng, 1, 4), c = ri(rng, 1, 4);
        if (a - b - c < 0 || a - b < 0) return null;
        return { expr: `${a}-${b}-${c}=`, ans: a - b - c };
      });
      const mix = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 3, 8), b = ri(rng, 1, 4), c = ri(rng, 1, 4);
        if (a + b > 10 || a + b - c < 0) return null;
        return { expr: `${a}+${b}-${c}=`, ans: a + b - c };
      });
      return [
        "\\kpsection{まえから じゅんに けいさんしましょう}",
        grid(calcItems([...addadd, ...subsub, ...mix]), 3),
      ].join("\n");
    })(),
  });

  // ⑪ くりあがりのたしざん① ----------------------------------------------
  add({
    id: "g1-11",
    unitNo: 11,
    name: "算数1年⑪ くりあがりの たしざん (1)",
    title: "くりあがりの たしざん (1)",
    subtitle: "わが 11〜14 の たしざん",
    goal: "くり上がりのある(1位数)+(1位数)。10 のまとまりをつくる考え方(さくらんぼ計算)を反復します。",
    body: (() => {
      const rng = rngFromString("g1-11");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAddCarry(rng, 21, { maxSum: 14 })), 3),
      ].join("\n");
    })(),
  });

  // ⑫ くりあがりのたしざん② ----------------------------------------------
  add({
    id: "g1-12",
    unitNo: 12,
    name: "算数1年⑫ くりあがりの たしざん (2)",
    title: "くりあがりの たしざん (2)",
    subtitle: "わが 11〜18 の たしざん",
    goal: "くり上がりのあるたし算のしあげ。和が 18 までの 1 桁どうしを確実に計算します。",
    body: (() => {
      const rng = rngFromString("g1-12");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAddCarry(rng, 21, { maxSum: 18 })), 3),
      ].join("\n");
    })(),
  });

  // ⑬ くりさがりのひきざん① ----------------------------------------------
  add({
    id: "g1-13",
    unitNo: 13,
    name: "算数1年⑬ くりさがりの ひきざん (1)",
    title: "くりさがりの ひきざん (1)",
    subtitle: "11〜14 からの ひきざん",
    goal: "くり下がりのある(十何)−(1位数)。10 から引いてたす考え方(減加法)を反復します。",
    body: (() => {
      const rng = rngFromString("g1-13");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genSubBorrow(rng, 21, { max: 14 })), 3),
      ].join("\n");
    })(),
  });

  // ⑭ くりさがりのひきざん② ----------------------------------------------
  add({
    id: "g1-14",
    unitNo: 14,
    name: "算数1年⑭ くりさがりの ひきざん (2)",
    title: "くりさがりの ひきざん (2)",
    subtitle: "11〜18 からの ひきざん",
    goal: "くり下がりのあるひき算のしあげ。18 までの数からのひき算を確実にします。",
    body: (() => {
      const rng = rngFromString("g1-14");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genSubBorrow(rng, 21, { max: 18 })), 3),
      ].join("\n");
    })(),
  });

  // ⑮ 大きいかず(100まで) ------------------------------------------------
  add({
    id: "g1-15",
    unitNo: 15,
    name: "算数1年⑮ 大きい かず (100まで)",
    title: "大きい かず (100まで)",
    subtitle: "なんじゅうの たし・ひき",
    goal: "100 までの数の構成。何十±何十、(2位数)+(1位数) のくり上がりのない計算を反復します。",
    body: (() => {
      const rng = rngFromString("g1-15");
      const tens = uniqueProbs(rng, 6, () => {
        const a = ri(rng, 2, 8) * 10;
        const b = ri(rng, 1, 9 - a / 10) * 10;
        if (a + b > 90) return null;
        return { expr: `${a}+${b}=`, ans: a + b };
      });
      const tensSub = uniqueProbs(rng, 5, () => {
        const a = ri(rng, 3, 9) * 10;
        const b = ri(rng, 1, a / 10 - 1) * 10;
        return { expr: `${a}-${b}=`, ans: a - b };
      });
      const d2 = uniqueProbs(rng, 7, () => {
        const a = ri(rng, 2, 9) * 10 + ri(rng, 1, 8);
        const b = ri(rng, 1, 9 - (a % 10));
        if ((a % 10) + b >= 10) return null;
        return { expr: `${a}+${b}=`, ans: a + b };
      });
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems([...tens, ...tensSub, ...d2]), 3),
      ].join("\n");
    })(),
  });

  // ⑯ ぶんしょうだい ------------------------------------------------------
  add({
    id: "g1-16",
    unitNo: 16,
    name: "算数1年⑯ ぶんしょうだい (たし・ひき)",
    title: "ぶんしょうだい",
    subtitle: "たすのかな ひくのかな",
    goal: "場面を読み取り、たし算かひき算かを自分で決めて(演算決定)、式と答えを書きます。",
    body: (() => {
      const Q = (no, text, eq, ans, unit) =>
        `\\kpqfull{(${no})}{${text}\\par\\vspace{2.5mm}しき \\ \\kpblank{${eq}} \\qquad こたえ \\ \\kpbox{${ans}}\\,${unit}}`;
      return [
        "\\kpsection{しきを かいて こたえましょう}",
        Q(1, "あめが 6こ あります。4こ もらいました。ぜんぶで なんこに なりましたか。", "6+4=10", "10", "こ"),
        Q(2, "こうえんに こどもが 8にん います。3にん かえりました。のこりは なんにんですか。", "8-3=5", "5", "にん"),
        Q(3, "あかい はなが 5ほん、しろい はなが 7ほん さいています。あわせて なんぼんですか。", "5+7=12", "12", "ほん"),
        Q(4, "どんぐりを 13こ ひろいました。5こ つかいました。のこりは なんこですか。", "13-5=8", "8", "こ"),
      ].join("\n");
    })(),
  });

  // ⑰ かたち --------------------------------------------------------------
  add({
    id: "g1-17",
    unitNo: 17,
    name: "算数1年⑰ かたち",
    title: "かたち",
    subtitle: "まる・さんかく・しかく",
    goal: "身のまわりの形を、まる・さんかく・しかくの仲間に分けます。立体・平面図形の特徴に親しみます。",
    body: (() => {
      const shapeRow =
        "\\begin{tikzpicture}[scale=0.7]" +
        "\\draw[kpblue,line width=1.2pt] (0,0) rectangle (1,1);" +
        "\\draw[kpgreen,line width=1.2pt] (1.6,0.5) circle (0.5);" +
        "\\draw[kpink,line width=1.2pt] (2.7,0) -- (3.7,0) -- (3.2,1) -- cycle;" +
        "\\draw[kpblue,line width=1.2pt] (4.3,0) rectangle (5.3,1);" +
        "\\draw[kpink,line width=1.2pt] (5.9,0) -- (6.9,0) -- (6.4,1) -- cycle;" +
        "\\draw[kpgreen,line width=1.2pt] (7.5,0.5) circle (0.5);" +
        "\\draw[kpgreen,line width=1.2pt] (8.8,0.5) circle (0.5);" +
        "\\end{tikzpicture}";
      return [
        "\\kpsection{かたちを かぞえましょう}",
        `\\begin{center}${shapeRow}\\end{center}\\vspace{4mm}`,
        "\\kpqfull{(1)}{しかく(\\textcolor{kpblue}{$\\blacksquare$})は いくつ ありますか。 \\quad こたえ \\kpbox{2} つ}",
        "\\kpqfull{(2)}{まる(\\textcolor{kpgreen}{$\\bullet$})は いくつ ありますか。 \\quad こたえ \\kpbox{3} つ}",
        "\\kpqfull{(3)}{さんかく(\\textcolor{kpink}{$\\blacktriangle$})は いくつ ありますか。 \\quad こたえ \\kpbox{2} つ}",
        "\\kpqfull{(4)}{いちばん おおい かたちは どれですか。 \\quad こたえ \\kpbox{まる}}",
      ].join("\n");
    })(),
  });

  // ⑱ 1年のまとめ --------------------------------------------------------
  add({
    id: "g1-18",
    unitNo: 18,
    name: "算数1年⑱ 1年の まとめ",
    title: "1年の まとめ",
    subtitle: "たし算・ひき算の しあげ",
    goal: "1 年で学んだたし算・ひき算(くり上がり・くり下がりを含む)を総合的に復習します。",
    body: (() => {
      const rng = rngFromString("g1-18");
      const mix = [
        ...genAdd(rng, 4, { maxSum: 10 }),
        ...genAddCarry(rng, 5, { maxSum: 18 }),
        ...genSub(rng, 4, { max: 10 }),
        ...genSubBorrow(rng, 5, { max: 18 }),
      ];
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(mix), 3),
      ].join("\n");
    })(),
  });

  return P;
}

export const prints = [...buildG1()];
