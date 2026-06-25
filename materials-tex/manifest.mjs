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
    goal: "1から 10までの かずを かぞえて、すうじで かいて みよう！",
    desc: "1〜10 の数を、ものの個数と対応させて数え、数字で書けるようにします。",
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
    goal: "かずを 2つに わけて、「いくつと いくつ」を かんがえよう！",
    desc: "10 までの数の合成・分解(いくつといくつ)を身につけ、たし算・ひき算の素地をつくります。",
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
    goal: "あわせると いくつ？ 6までの たしざんを やってみよう！",
    desc: "合併・増加の場面のたし算。和が 6 までの 1 桁どうしのたし算を確実にします。",
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
    goal: "あわせて 10までの たしざんを たくさん れんしゅうしよう！",
    desc: "和が 10 までのたし算。くり上がりのない 1 桁どうしを反復します。",
    body: (() => {
      const rng = rngFromString("g1-04");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAdd(rng, 27, { maxSum: 10 })), 3),
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
    goal: "のこりは いくつ？ 10までの ひきざんを やってみよう！",
    desc: "求残・求差のひき算。10 までの数からのくり下がりのないひき算を確実にします。",
    body: (() => {
      const rng = rngFromString("g1-05");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genSub(rng, 27, { max: 10 })), 3),
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
    goal: "ちがいは いくつ？ ひきざんを たくさん れんしゅうしよう！",
    desc: "2 つの数のちがいを求めるひき算。0 のひき算もふくめて反復します。",
    body: (() => {
      const rng = rngFromString("g1-06");
      const probs = genSub(rng, 21, { max: 10 });
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
    goal: "まえから なんばんめ？ じゅんばんを かんがえよう！",
    desc: "順序数(なんばんめ)と集合数(なんこ)のちがいを理解します。前後・左右の位置の表し方を学びます。",
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
    goal: "20までの かずで、たしざんと ひきざんを やってみよう！",
    desc: "20 までの数の構成(10 と いくつ)。10+□、1□+□、1□−□ のくり上がり・くり下がりのない計算を反復します。",
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
    goal: "とけいを よんで、「なんじ」「なんじはん」を いえるように なろう！",
    desc: "「何時」「何時半」の時計を読みます。日常生活と時刻を結びつけます。",
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
    goal: "3つの かずを、まえから じゅんに けいさんしよう！",
    desc: "3 口の加減(増えてから減る、続けて増える等)を、前から順に計算します。",
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
    goal: "くりあがりの たしざんに ちょうせん！ 10の まとまりを つくろう！",
    desc: "くり上がりのある(1位数)+(1位数)。10 のまとまりをつくる考え方(さくらんぼ計算)を反復します。",
    body: (() => {
      const rng = rngFromString("g1-11");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAddCarry(rng, 24, { maxSum: 14 })), 3),
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
    goal: "くりあがりの たしざんを すらすら できるように なろう！",
    desc: "くり上がりのあるたし算のしあげ。和が 18 までの 1 桁どうしを確実に計算します。",
    body: (() => {
      const rng = rngFromString("g1-12");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genAddCarry(rng, 27, { maxSum: 18 })), 3),
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
    goal: "くりさがりの ひきざんに ちょうせん！",
    desc: "くり下がりのある(十何)−(1位数)。10 から引いてたす考え方(減加法)を反復します。",
    body: (() => {
      const rng = rngFromString("g1-13");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genSubBorrow(rng, 24, { max: 14 })), 3),
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
    goal: "くりさがりの ひきざんを すらすら できるように なろう！",
    desc: "くり下がりのあるひき算のしあげ。18 までの数からのひき算を確実にします。",
    body: (() => {
      const rng = rngFromString("g1-14");
      return [
        "\\kpsection{つぎの けいさんを しましょう}",
        grid(calcItems(genSubBorrow(rng, 27, { max: 18 })), 3),
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
    goal: "100までの おおきい かずで けいさんして みよう！",
    desc: "100 までの数の構成。何十±何十、(2位数)+(1位数) のくり上がりのない計算を反復します。",
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
    goal: "おはなしを よんで、たしざんか ひきざんか かんがえよう！",
    desc: "場面を読み取り、たし算かひき算かを自分で決めて(演算決定)、式と答えを書きます。",
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
    goal: "まる・さんかく・しかくの かたちを みつけよう！",
    desc: "身のまわりの形を、まる・さんかく・しかくの仲間に分けます。立体・平面図形の特徴に親しみます。",
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
    goal: "1ねんかんの たしざん・ひきざんの しあげ！ ぜんぶ できるかな？",
    desc: "1 年で学んだたし算・ひき算(くり上がり・くり下がりを含む)を総合的に復習します。",
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

  // ⑲ つみきを かぞえる -----------------------------------------------------
  add({
    id: "g1-19",
    unitNo: 19,
    name: "算数1年⑲ つみきは いくつ",
    title: "つみきは いくつ",
    subtitle: "つみきを かぞえよう",
    goal: "つみきが ぜんぶで いくつ あるか かぞえて、すうじで かこう！",
    desc: "具体物(立体)を数えて数量をとらえる。10〜15程度までの計数。",
    body: (() => {
      const pile = (cols, scale = 0.42) => {
        let tk = "";
        cols.forEach((h, c) => { for (let y = 0; y < h; y++) tk += `\\kpcube{${c}}{${y}}`; });
        return `\\begin{tikzpicture}[scale=${scale}]${tk}\\end{tikzpicture}`;
      };
      const cell = (cols, i) => {
        const total = cols.reduce((a, b) => a + b, 0);
        return `\\begin{minipage}[b]{0.22\\linewidth}\\centering (${i + 1})\\par\\vspace{1mm}${pile(cols)}\\par\\vspace{1.5mm}\\kpbox{${total}} こ\\end{minipage}`;
      };
      const a = [[3], [2, 2], [1, 2], [2, 1, 2]];
      const b = [[3, 2], [2, 3, 1], [3, 3], [2, 2, 2, 1]];
      return [
        "\\kpsection{つみきは いくつ ありますか}",
        "\\begin{center}", a.map(cell).join("\\hfill"), "\\end{center}",
        "\\vspace{4mm}",
        "\\kpsection{おおきい やまも かぞえて みよう}",
        "\\begin{center}", b.map((c, i) => cell(c, i + 4)).join("\\hfill"), "\\end{center}",
      ].join("\n");
    })(),
  });

  // ⑳ えで かぞえよう -------------------------------------------------------
  add({
    id: "g1-20",
    unitNo: 20,
    name: "算数1年⑳ えで かぞえよう",
    title: "えで かぞえよう",
    subtitle: "りんご・ボールを かぞえる",
    goal: "くだものや ボールが いくつ あるか、かぞえて すうじで かこう！",
    desc: "具体物(半具体物)を数えて数量をとらえる。並んだ絵の計数。",
    body: (() => {
      const apples = (n) => { let s = ""; for (let i = 0; i < n; i++) s += `\\kpapple{${i * 1.05}}{0}`; return s; };
      const balls = (n, col) => { let s = ""; for (let i = 0; i < n; i++) s += `\\kpball{${i * 1.05}}{0}{${col}}`; return s; };
      const q = (no, tk, ans) =>
        `\\kpqfull{(${no})}{\\raisebox{-3mm}{\\begin{tikzpicture}[scale=0.52]${tk}\\end{tikzpicture}}\\quad こたえ \\kpbox{${ans}} こ}`;
      return [
        "\\kpsection{いくつ ありますか。かぞえて かきましょう}",
        q(1, apples(5), 5),
        q(2, balls(7, "kpblue"), 7),
        q(3, apples(8), 8),
        q(4, balls(6, "red!70"), 6),
        q(5, apples(9), 9),
      ].join("\n");
    })(),
  });

  return P;
}


// --- 追加の計算ジェネレータ (2・3年用) ---
function hasCarryAdd(a, b) { while (a > 0 || b > 0) { if ((a % 10) + (b % 10) >= 10) return true; a = Math.floor(a / 10); b = Math.floor(b / 10); } return false; }
function hasBorrow(a, b) { while (b > 0) { if ((a % 10) < (b % 10)) return true; a = Math.floor(a / 10); b = Math.floor(b / 10); } return false; }
const fmt1 = (x) => (Number.isInteger(x) ? `${x}` : x.toFixed(1));
function genMul(rng, count, { tables, bmax = 9 }) {
  return uniqueProbs(rng, count, () => {
    const a = tables[Math.floor(rng() * tables.length)];
    const b = ri(rng, 1, bmax);
    return { expr: `${a}\\times${b}=`, ans: a * b };
  });
}
function genDiv(rng, count, { bmin = 2, bmax = 9 }) {
  return uniqueProbs(rng, count, () => {
    const b = ri(rng, bmin, bmax);
    const q = ri(rng, 1, 9);
    return { expr: `${b * q}\\div${b}=`, ans: q };
  });
}
function genDivRem(rng, count) {
  return uniqueProbs(rng, count, () => {
    const b = ri(rng, 2, 9);
    const q = ri(rng, 1, 9);
    const r = ri(rng, 1, b - 1);
    return { expr: `${b * q + r}\\div${b}=`, ans: `${q}あまり${r}` };
  });
}
function genAddN(rng, count, { min, max, carry = null }) {
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, min, max), b = ri(rng, min, max);
    if (carry === false && hasCarryAdd(a, b)) return null;
    if (carry === true && !hasCarryAdd(a, b)) return null;
    return { expr: `${a}+${b}=`, ans: a + b };
  });
}
function genSubN(rng, count, { min, max, borrow = null }) {
  return uniqueProbs(rng, count, () => {
    let a = ri(rng, min, max), b = ri(rng, min, max);
    if (a < b) { const t = a; a = b; b = t; }
    if (a === b) return null;
    if (borrow === false && hasBorrow(a, b)) return null;
    if (borrow === true && !hasBorrow(a, b)) return null;
    return { expr: `${a}-${b}=`, ans: a - b };
  });
}
function genMulBig(rng, count, { amin, amax, bmin, bmax }) {
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, amin, amax), b = ri(rng, bmin, bmax);
    return { expr: `${a}\\times${b}=`, ans: a * b };
  });
}
function genDecimal(rng, count) {
  return uniqueProbs(rng, count, () => {
    const a = ri(rng, 2, 89) / 10, b = ri(rng, 2, 89) / 10;
    if (rng() < 0.5) {
      const hi = Math.max(a, b), lo = Math.min(a, b);
      if (hi === lo) return null;
      return { expr: `${fmt1(hi)}-${fmt1(lo)}=`, ans: fmt1(Math.round((hi - lo) * 10) / 10) };
    }
    return { expr: `${fmt1(a)}+${fmt1(b)}=`, ans: fmt1(Math.round((a + b) * 10) / 10) };
  });
}
function genFracSame(rng, count) {
  return uniqueProbs(rng, count, () => {
    const d = ri(rng, 3, 8);
    if (rng() < 0.5) {
      const x = ri(rng, 1, d - 2), y = ri(rng, 1, d - 1 - x);
      if (x + y >= d || y < 1) return null;
      return { expr: `\\frac{${x}}{${d}}+\\frac{${y}}{${d}}=`, ans: `$\\frac{${x + y}}{${d}}$` };
    }
    const x = ri(rng, 2, d - 1), y = ri(rng, 1, x - 1);
    return { expr: `\\frac{${x}}{${d}}-\\frac{${y}}{${d}}=`, ans: `$\\frac{${x - y}}{${d}}$` };
  });
}
// 計算ドリル(セクション+グリッド)を1行で作る
function calcPrint(def, gen, cols = 3, section = "つぎの けいさんを しましょう") {
  const rng = rngFromString(def.id);
  return { subject: "算数", ...def, body: [`\\kpsection{${section}}`, grid(calcItems(gen(rng)), cols)].join("\n") };
}

// =============================================================================
// プリント一覧 (小学2年)
// =============================================================================
function buildG2() {
  const P = [];
  const add = (d) => P.push(d);
  const G = 2;

  // ① ひょうとグラフ
  add({ grade: G, subject: "算数", id: "g2-01", unitNo: 1, name: "算数2年① ひょうと グラフ", title: "ひょうと グラフ", subtitle: "かずを よみとる",
    goal: "ひょうや グラフを よんで、かずを くらべて みよう！", desc: "簡単な事柄を表やグラフに表し、数を読み取る。",
    body: [
      "\\kpsection{すきな くだもの しらべ}",
      "{\\large りんご … 4にん ／ みかん … 6にん ／ ぶどう … 3にん ／ いちご … 5にん}\\par\\vspace{3mm}",
      "\\kpqfull{(1)}{いちばん おおい くだものは どれですか。 \\quad こたえ \\kpbox{みかん}}",
      "\\kpqfull{(2)}{りんごと いちごは あわせて なんにんですか。 \\quad こたえ \\kpbox{9} にん}",
      "\\kpqfull{(3)}{みかんは ぶどうより なんにん おおいですか。 \\quad こたえ \\kpbox{3} にん}",
      "\\kpqfull{(4)}{ぜんぶで なんにん しらべましたか。 \\quad こたえ \\kpbox{18} にん}",
    ].join("\n") });

  // ② 時こくと時間(1)
  add({ grade: G, subject: "算数", id: "g2-02", unitNo: 2, name: "算数2年② 時こくと 時間 (1)", title: "とけいを よもう", subtitle: "なんじ なんぷん",
    goal: "とけいの ながいはりを よんで「なんじ なんぷん」が わかるように なろう！", desc: "時刻の読み方(何時何分)。1日の時間、午前・午後。",
    body: (() => {
      const clocks = [[3, 15, "3じ15ふん"], [8, 40, "8じ40ぷん"], [10, 5, "10じ5ふん"], [6, 30, "6じ30ぷん"], [1, 50, "1じ50ぷん"], [12, 20, "12じ20ぷん"]];
      const cell = ([h, m, ans], i) => `\\begin{minipage}[t]{0.3\\linewidth}\\centering (${i + 1})\\par \\kpclock{${h}}{${m}}\\par\\vspace{1mm}\\kpbox{${ans}}\\end{minipage}`;
      return ["\\kpsection{なんじ なんぷんですか}", "\\begin{center}", clocks.slice(0, 3).map(cell).join("\\hfill"), "\\par\\vspace{6mm}", clocks.slice(3).map((c, i) => cell(c, i + 3)).join("\\hfill"), "\\end{center}"].join("\n");
    })() });

  // ③ 2けたのたし算(暗算)
  add(calcPrint({ grade: G, id: "g2-03", unitNo: 3, name: "算数2年③ 2けたの たし算", title: "2けたの たし算", subtitle: "くり上がりの ない あんざん", goal: "2けたの たし算を、あたまの なかで すばやく できるように なろう！", desc: "(2位数)+(1,2位数)で繰り上がりのない加法。" }, (rng) => genAddN(rng, 24, { min: 11, max: 88, carry: false })));

  // ④ たし算のひっ算
  add(calcPrint({ grade: G, id: "g2-04", unitNo: 4, name: "算数2年④ たし算の ひっ算", title: "たし算の ひっ算", subtitle: "くり上がりの ある たし算", goal: "くり上がりの ある 2けたの たし算を、ひっ算で できるように なろう！", desc: "繰り上がりのある(2位数)+(2位数)の筆算。" }, (rng) => genAddN(rng, 24, { min: 13, max: 89, carry: true })));

  // ⑤ ひき算のひっ算
  add(calcPrint({ grade: G, id: "g2-05", unitNo: 5, name: "算数2年⑤ ひき算の ひっ算", title: "ひき算の ひっ算", subtitle: "くり下がりの ある ひき算", goal: "くり下がりの ある 2けたの ひき算を、ひっ算で できるように なろう！", desc: "繰り下がりのある(2位数)-(1,2位数)の筆算。" }, (rng) => genSubN(rng, 24, { min: 21, max: 99, borrow: true })));

  // ⑥ 1000までの数
  add({ grade: G, subject: "算数", id: "g2-06", unitNo: 6, name: "算数2年⑥ 1000までの 数", title: "1000までの 数", subtitle: "数の しくみ", goal: "100が いくつ、10が いくつ…で 数を かんがえよう！", desc: "1000までの数の構成・読み方・書き方。",
    body: [
      "\\kpsection{$\\square$ に あう 数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{100が 3こ、10が 5こ、1が 8こで \\kpbox{358}}",
      "\\kpitemx{(2)}{100が 6こ、10が 0こ、1が 4こで \\kpbox{604}}",
      "\\kpitemx{(3)}{100が 7こで \\kpbox{700}}",
      "\\kpitemx{(4)}{472は 100が \\kpbox{4} こ、10が \\kpbox{7} こ、1が \\kpbox{2} こ}",
      "\\kpitemx{(5)}{990より 10 大きい数は \\kpbox{1000}}",
      "\\kpitemx{(6)}{640は 10を \\kpbox{64} こ あつめた数}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑦ 大きい数のたし算とひき算
  add(calcPrint({ grade: G, id: "g2-07", unitNo: 7, name: "算数2年⑦ 大きい数の たし算と ひき算", title: "大きい数の けいさん", subtitle: "3けたの たし算・ひき算", goal: "3けたの たし算・ひき算を ひっ算で できるように なろう！", desc: "(3位数)±(2,3位数)の筆算。" }, (rng) => [...genAddN(rng, 10, { min: 105, max: 899 }), ...genSubN(rng, 10, { min: 120, max: 999 })], 2));

  // ⑧ 長さ(1) cm mm
  add({ grade: G, subject: "算数", id: "g2-08", unitNo: 8, name: "算数2年⑧ 長さ (1) cm と mm", title: "長さ (cm と mm)", subtitle: "1cm = 10mm", goal: "cm と mm の かんけいを おぼえて、長さを あらわそう！", desc: "長さの単位cm,mm。1cm=10mm。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1 cm $=$ \\kpbox{10} mm}",
      "\\kpitemx{(2)}{4 cm $=$ \\kpbox{40} mm}",
      "\\kpitemx{(3)}{3 cm 5 mm $=$ \\kpbox{35} mm}",
      "\\kpitemx{(4)}{60 mm $=$ \\kpbox{6} cm}",
      "\\kpitemx{(5)}{8 cm 2 mm $=$ \\kpbox{82} mm}",
      "\\kpitemx{(6)}{47 mm $=$ \\kpbox{4} cm \\kpbox{7} mm}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑨ 水のかさ
  add({ grade: G, subject: "算数", id: "g2-09", unitNo: 9, name: "算数2年⑨ 水の かさ", title: "水の かさ", subtitle: "L・dL・mL", goal: "L・dL・mL の かんけいを おぼえよう！", desc: "かさの単位L,dL,mL。1L=10dL=1000mL。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1 L $=$ \\kpbox{10} dL}",
      "\\kpitemx{(2)}{1 dL $=$ \\kpbox{100} mL}",
      "\\kpitemx{(3)}{1 L $=$ \\kpbox{1000} mL}",
      "\\kpitemx{(4)}{3 L 2 dL $=$ \\kpbox{32} dL}",
      "\\kpitemx{(5)}{50 dL $=$ \\kpbox{5} L}",
      "\\kpitemx{(6)}{2 L $=$ \\kpbox{2000} mL}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑩ 三角形と四角形
  add({ grade: G, subject: "算数", id: "g2-10", unitNo: 10, name: "算数2年⑩ 三角形と 四角形", title: "三角形と 四角形", subtitle: "へん・ちょうてん・直角", goal: "三角形や 四角形の かたちを しらべよう！", desc: "三角形・四角形の意味、辺・頂点、直角。",
    body: (() => {
      const pic = "\\begin{tikzpicture}[scale=0.8]" +
        "\\draw[kpblue,line width=1.2pt] (0,0)--(1.6,0)--(0.8,1.3)--cycle;" +
        "\\draw[kpgreen,line width=1.2pt] (2.4,0) rectangle (3.9,1.3);" +
        "\\draw[kpink,line width=1.2pt] (4.6,0)--(6.4,0)--(6.0,1.2)--(4.9,1.2)--cycle;" +
        "\\end{tikzpicture}";
      return [
        "\\kpsection{かたちを しらべましょう}",
        `\\begin{center}${pic}\\end{center}\\vspace{3mm}`,
        "\\kpqfull{(1)}{三角形の ちょうてんは いくつ ありますか。 \\quad こたえ \\kpbox{3} つ}",
        "\\kpqfull{(2)}{四角形の へんは いくつ ありますか。 \\quad こたえ \\kpbox{4} つ}",
        "\\kpqfull{(3)}{まんなかの かたちのように、4つの かどが みんな 直角な 四角形を なんと いいますか。 \\quad こたえ \\kpbox{長方形}}",
      ].join("\n");
    })() });

  // ⑪ かけ算(1)
  add(calcPrint({ grade: G, id: "g2-11", unitNo: 11, name: "算数2年⑪ かけ算 (1)", title: "かけ算 (1)", subtitle: "2・3・4・5の だん", goal: "2・3・4・5の だんの 九九を おぼえよう！", desc: "乗法の意味。2,3,4,5の段の九九。" }, (rng) => genMul(rng, 24, { tables: [2, 5, 3, 4] })));

  // ⑫ かけ算(2)
  add(calcPrint({ grade: G, id: "g2-12", unitNo: 12, name: "算数2年⑫ かけ算 (2)", title: "かけ算 (2)", subtitle: "6・7・8・9・1の だん", goal: "6・7・8・9・1の だんの 九九を おぼえよう！", desc: "6〜9,1の段の九九。" }, (rng) => genMul(rng, 24, { tables: [6, 7, 8, 9, 1] })));

  // ⑬ かけ算(3) 九九ミックス
  add(calcPrint({ grade: G, id: "g2-13", unitNo: 13, name: "算数2年⑬ かけ算 (3) 九九ミックス", title: "九九 ミックス", subtitle: "ぜんぶの だん", goal: "ぜんぶの だんの 九九を すらすら いえるように なろう！", desc: "九九表。乗法の交換法則。" }, (rng) => genMul(rng, 27, { tables: [1, 2, 3, 4, 5, 6, 7, 8, 9] })));

  // ⑭ 分数
  add({ grade: G, subject: "算数", id: "g2-14", unitNo: 14, name: "算数2年⑭ 分数", title: "分数", subtitle: "1/2・1/3・1/4", goal: "ぜんたいを おなじ 大きさに わけた 1つぶんを 分数で あらわそう！", desc: "分数の意味(1/2,1/3,1/4)。",
    body: [
      "\\kpsection{$\\square$ に あう 分数や 数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{ぜんたいを 2つに わけた 1つぶんは \\kpbox{$\\frac{1}{2}$}}",
      "\\kpitemx{(2)}{ぜんたいを 4つに わけた 1つぶんは \\kpbox{$\\frac{1}{4}$}}",
      "\\kpitemx{(3)}{ぜんたいを 3つに わけた 1つぶんは \\kpbox{$\\frac{1}{3}$}}",
      "\\kpitemx{(4)}{$\\frac{1}{4}$ が 4こで \\kpbox{1}}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑮ 時こくと時間(2)
  add({ grade: G, subject: "算数", id: "g2-15", unitNo: 15, name: "算数2年⑮ 時こくと 時間 (2)", title: "時間の けいさん", subtitle: "1時間 = 60分", goal: "1時間=60分。 時間の かんけいを おぼえよう！", desc: "時間の計算。1時間=60分。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1 時間 $=$ \\kpbox{60} 分}",
      "\\kpitemx{(2)}{70 分 $=$ \\kpbox{1} 時間 \\kpbox{10} 分}",
      "\\kpitemx{(3)}{2 時間 $=$ \\kpbox{120} 分}",
      "\\kpitemx{(4)}{午前 9時から 午前 11時までは \\kpbox{2} 時間}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑯ 10000までの数
  add({ grade: G, subject: "算数", id: "g2-16", unitNo: 16, name: "算数2年⑯ 10000までの 数", title: "10000までの 数", subtitle: "千のくらい", goal: "千のくらいまでの 大きい数を かんがえよう！", desc: "10000までの数の構成・読み方・書き方。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1000が 3こ、100が 5こ、10が 2こ、1が 7こで \\kpbox{3527}}",
      "\\kpitemx{(2)}{2840は 1000が \\kpbox{2} こ、100が \\kpbox{8} こ、10が \\kpbox{4} こ}",
      "\\kpitemx{(3)}{9000より 1000 大きい数は \\kpbox{10000}}",
      "\\kpitemx{(4)}{6000は 1000を \\kpbox{6} こ あつめた数}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑰ 長さ(2) m
  add({ grade: G, subject: "算数", id: "g2-17", unitNo: 17, name: "算数2年⑰ 長さ (2) m", title: "長さ (m)", subtitle: "1m = 100cm", goal: "m と cm の かんけいを おぼえよう！", desc: "長さの単位m。1m=100cm。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1 m $=$ \\kpbox{100} cm}",
      "\\kpitemx{(2)}{2 m 50 cm $=$ \\kpbox{250} cm}",
      "\\kpitemx{(3)}{300 cm $=$ \\kpbox{3} m}",
      "\\kpitemx{(4)}{1 m 8 cm $=$ \\kpbox{108} cm}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑱ たし算とひき算(文章題)
  add({ grade: G, subject: "算数", id: "g2-18", unitNo: 18, name: "算数2年⑱ たし算と ひき算 (ぶんしょうだい)", title: "ぶんしょうだい", subtitle: "たし算・ひき算", goal: "おはなしを よんで、しきを かいて こたえよう！", desc: "場面を読み取り加減の式を立てる。",
    body: (() => {
      const Q = (no, text, eq, ans, unit) => `\\kpqfull{(${no})}{${text}\\par\\vspace{2.5mm}しき \\ \\kpblank{${eq}} \\qquad こたえ \\ \\kpbox{${ans}}\\,${unit}}`;
      return [
        "\\kpsection{しきを かいて こたえましょう}",
        Q(1, "あめが 45こ あります。28こ もらいました。ぜんぶで なんこですか。", "45+28=73", "73", "こ"),
        Q(2, "りんごが 52こ ありました。17こ たべました。のこりは なんこですか。", "52-17=35", "35", "こ"),
        Q(3, "いろえんぴつが 1はこ 12本 あります。3はこでは なん本ですか。", "$12\\times3=36$", "36", "本"),
      ].join("\n");
    })() });

  // ⑲ はこの形
  add({ grade: G, subject: "算数", id: "g2-19", unitNo: 19, name: "算数2年⑲ はこの 形", title: "はこの 形", subtitle: "めん・へん・ちょうてん", goal: "はこの 形の めん・へん・ちょうてんの 数を しらべよう！", desc: "箱の形の構成要素(面・辺・頂点)。",
    body: (() => {
      const cube = "\\begin{tikzpicture}[scale=0.9]\\kpcube{0}{0}\\end{tikzpicture}";
      return [
        "\\kpsection{はこの 形を しらべましょう}",
        `\\begin{center}${cube}\\end{center}\\vspace{3mm}`,
        "\\kpqfull{(1)}{はこの 形の めんは いくつ ありますか。 \\quad こたえ \\kpbox{6} つ}",
        "\\kpqfull{(2)}{ちょうてんは いくつ ありますか。 \\quad こたえ \\kpbox{8} つ}",
        "\\kpqfull{(3)}{へんは いくつ ありますか。 \\quad こたえ \\kpbox{12} つ}",
      ].join("\n");
    })() });

  // ⑳ 2年のまとめ
  add(calcPrint({ grade: G, id: "g2-20", unitNo: 20, name: "算数2年⑳ 2年の まとめ", title: "2年の まとめ", subtitle: "たし算・ひき算・九九", goal: "2年で ならった けいさんの しあげ！ ぜんぶ できるかな？", desc: "2年の計算の総合復習(筆算・九九)。" }, (rng) => [...genAddN(rng, 6, { min: 23, max: 89, carry: true }), ...genSubN(rng, 6, { min: 31, max: 99, borrow: true }), ...genMul(rng, 12, { tables: [3, 4, 6, 7, 8, 9] })]));

  return P;
}


// =============================================================================
// プリント一覧 (小学3年)
// =============================================================================
function buildG3() {
  const P = [];
  const add = (d) => P.push(d);
  const G = 3;

  // ① かけ算のきまり
  add({ grade: G, subject: "算数", id: "g3-01", unitNo: 1, name: "算数3年① かけ算の きまり", title: "かけ算の きまり", subtitle: "0の だん・10倍・きまり", goal: "0や 10の かけ算と、かけ算の きまりを つかえるように なろう！", desc: "乗法のきまり(交換・0の乗法・10の乗法)。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{$7\\times0=$ \\kpbox{0}}",
      "\\kpitemx{(2)}{$0\\times6=$ \\kpbox{0}}",
      "\\kpitemx{(3)}{$4\\times10=$ \\kpbox{40}}",
      "\\kpitemx{(4)}{$10\\times8=$ \\kpbox{80}}",
      "\\kpitemx{(5)}{$3\\times6=6\\times$ \\kpbox{3}}",
      "\\kpitemx{(6)}{$5\\times7=5\\times6+$ \\kpbox{5}}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ② 時こくと時間(1)
  add({ grade: G, subject: "算数", id: "g3-02", unitNo: 2, name: "算数3年② 時こくと 時間 (1)", title: "時間の けいさん", subtitle: "時こくと 時間", goal: "時こくと 時間の けいさんが できるように なろう！", desc: "時間の計算、日常生活と時刻。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{午前 8時から 午後 3時までは \\kpbox{7} 時間}",
      "\\kpitemx{(2)}{40分 $+$ 30分 $=$ \\kpbox{1} 時間 \\kpbox{10} 分}",
      "\\kpitemx{(3)}{1時間20分 $=$ \\kpbox{80} 分}",
      "\\kpitemx{(4)}{9時50分から 20分 たつと \\kpbox{10} 時 \\kpbox{10} 分}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ③ わり算
  add(calcPrint({ grade: G, id: "g3-03", unitNo: 3, name: "算数3年③ わり算", title: "わり算", subtitle: "九九を つかって", goal: "九九を つかって わり算が できるように なろう！", desc: "除法の意味と答えの求め方(九九1回適用)。" }, (rng) => genDiv(rng, 24, { bmin: 2, bmax: 9 })));

  // ④ あまりのあるわり算
  add(calcPrint({ grade: G, id: "g3-04", unitNo: 4, name: "算数3年④ あまりの ある わり算", title: "あまりの ある わり算", subtitle: "わって あまりを だす", goal: "あまりの ある わり算が できるように なろう！", desc: "余りのある除法の意味と計算。" }, (rng) => genDivRem(rng, 21), 3));

  // ⑤ たし算とひき算(3,4けたの筆算)
  add(calcPrint({ grade: G, id: "g3-05", unitNo: 5, name: "算数3年⑤ たし算と ひき算 (ひっ算)", title: "大きい数の ひっ算", subtitle: "3けた・4けたの たし算ひき算", goal: "3けた・4けたの たし算・ひき算を ひっ算で できるように なろう！", desc: "(3,4位数)±(3,4位数)の筆算。" }, (rng) => [...genAddN(rng, 8, { min: 235, max: 4899 }), ...genSubN(rng, 8, { min: 412, max: 9999 })], 2));

  // ⑥ 表とグラフ
  add({ grade: G, subject: "算数", id: "g3-06", unitNo: 6, name: "算数3年⑥ 表と グラフ", title: "表と グラフ", subtitle: "ぼうグラフ", goal: "ぼうグラフを よんで、数を くらべよう！", desc: "棒グラフの読み方、表の整理。",
    body: [
      "\\kpsection{1しゅうかんに よんだ 本の さっすう}",
      "{\\large 月 … 3さつ ／ 火 … 5さつ ／ 水 … 2さつ ／ 木 … 6さつ ／ 金 … 4さつ}\\par\\vspace{3mm}",
      "\\kpqfull{(1)}{いちばん おおく よんだ 曜日は どれですか。 \\quad こたえ \\kpbox{木}}",
      "\\kpqfull{(2)}{月と 金では あわせて なんさつ よみましたか。 \\quad こたえ \\kpbox{7} さつ}",
      "\\kpqfull{(3)}{1しゅうかんで ぜんぶで なんさつ よみましたか。 \\quad こたえ \\kpbox{20} さつ}",
    ].join("\n") });

  // ⑦ 長さ km
  add({ grade: G, subject: "算数", id: "g3-07", unitNo: 7, name: "算数3年⑦ 長さ (km)", title: "長さ (km)", subtitle: "1km = 1000m", goal: "km と m の かんけいを おぼえよう！", desc: "長さの単位km。1km=1000m。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1 km $=$ \\kpbox{1000} m}",
      "\\kpitemx{(2)}{2 km 300 m $=$ \\kpbox{2300} m}",
      "\\kpitemx{(3)}{1500 m $=$ \\kpbox{1} km \\kpbox{500} m}",
      "\\kpitemx{(4)}{3 km $=$ \\kpbox{3000} m}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑧ (2けた)×(1けた)
  add(calcPrint({ grade: G, id: "g3-08", unitNo: 8, name: "算数3年⑧ (2けた)×(1けた)", title: "(2けた)×(1けた)", subtitle: "かけ算の ひっ算", goal: "2けた×1けたの かけ算が できるように なろう！", desc: "(2位数)×(1位数)の計算の仕方、筆算。" }, (rng) => genMulBig(rng, 21, { amin: 12, amax: 99, bmin: 2, bmax: 9 })));

  // ⑨ (3けた)×(1けた)
  add(calcPrint({ grade: G, id: "g3-09", unitNo: 9, name: "算数3年⑨ (3けた)×(1けた)", title: "(3けた)×(1けた)", subtitle: "かけ算の ひっ算", goal: "3けた×1けたの かけ算が できるように なろう！", desc: "(3位数)×(1位数)の筆算。" }, (rng) => genMulBig(rng, 18, { amin: 112, amax: 989, bmin: 2, bmax: 9 }), 2));

  // ⑩ 大きい数
  add({ grade: G, subject: "算数", id: "g3-10", unitNo: 10, name: "算数3年⑩ 大きい数", title: "大きい数", subtitle: "万の くらい", goal: "一万を こえる 大きい数を かんがえよう！", desc: "1億未満の数の構成・読み方。万。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{10000が 4こで \\kpbox{40000}}",
      "\\kpitemx{(2)}{1000が 10こで \\kpbox{10000}}",
      "\\kpitemx{(3)}{53000は 1000を \\kpbox{53} こ あつめた数}",
      "\\kpitemx{(4)}{38000より 2000 大きい数は \\kpbox{40000}}",
      "\\kpitemx{(5)}{$700\\times100=$ \\kpbox{70000}}",
      "\\kpitemx{(6)}{$60000\\div10=$ \\kpbox{6000}}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑪ 円と球
  add({ grade: G, subject: "算数", id: "g3-11", unitNo: 11, name: "算数3年⑪ 円と 球", title: "円と 球", subtitle: "半径・直径", goal: "円の 半径と 直径の かんけいを おぼえよう！", desc: "円の定義、中心・半径・直径の性質。",
    body: (() => {
      const pic = "\\begin{tikzpicture}[scale=0.9]\\draw[kpblue,line width=1.2pt](0,0)circle(1.2);\\fill(0,0)circle(1.5pt);\\draw[kpink,line width=1pt](0,0)--(1.2,0);\\node[font=\\small] at (0.6,0.22){はんけい};\\end{tikzpicture}";
      return [
        "\\kpsection{円に ついて こたえましょう}",
        `\\begin{center}${pic}\\end{center}\\vspace{2mm}`,
        "\\kpqfull{(1)}{半径 4cmの 円の 直径は なんcmですか。 \\quad こたえ \\kpbox{8} cm}",
        "\\kpqfull{(2)}{直径 10cmの 円の 半径は なんcmですか。 \\quad こたえ \\kpbox{5} cm}",
        "\\kpqfull{(3)}{直径は 半径の なんばいですか。 \\quad こたえ \\kpbox{2} ばい}",
      ].join("\n");
    })() });

  // ⑫ 時こくと時間(2) 秒
  add({ grade: G, subject: "算数", id: "g3-12", unitNo: 12, name: "算数3年⑫ 時こくと 時間 (2) 秒", title: "秒", subtitle: "1分 = 60秒", goal: "分と 秒の かんけいを おぼえよう！", desc: "短い時間、秒。1分=60秒。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1分 $=$ \\kpbox{60} 秒}",
      "\\kpitemx{(2)}{90秒 $=$ \\kpbox{1} 分 \\kpbox{30} 秒}",
      "\\kpitemx{(3)}{2分 $=$ \\kpbox{120} 秒}",
      "\\kpitemx{(4)}{1分45秒 $=$ \\kpbox{105} 秒}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑬ 小数
  add(calcPrint({ grade: G, id: "g3-13", unitNo: 13, name: "算数3年⑬ 小数", title: "小数", subtitle: "小数第一位の たしひき", goal: "小数の たし算・ひき算が できるように なろう！", desc: "小数(第一位)の仕組みと加減。" }, (rng) => genDecimal(rng, 18), 3));

  // ⑭ 三角形と角
  add({ grade: G, subject: "算数", id: "g3-14", unitNo: 14, name: "算数3年⑭ 三角形と 角", title: "三角形と 角", subtitle: "二等辺三角形・正三角形", goal: "いろいろな 三角形の なまえを おぼえよう！", desc: "二等辺三角形・正三角形の定義、角。",
    body: (() => {
      const pic = "\\begin{tikzpicture}[scale=0.85]\\draw[kpblue,line width=1.2pt](0,0)--(1.4,0)--(0.7,1.2)--cycle;\\draw[kpink,line width=1.2pt](2.4,0)--(3.8,0)--(3.1,1.2)--cycle;\\end{tikzpicture}";
      return [
        "\\kpsection{三角形を しらべましょう}",
        `\\begin{center}${pic}\\end{center}\\vspace{2mm}`,
        "\\kpqfull{(1)}{3つの へんの 長さが みんな おなじ 三角形を なんと いいますか。 \\quad こたえ \\kpbox{正三角形}}",
        "\\kpqfull{(2)}{2つの へんの 長さが おなじ 三角形を なんと いいますか。 \\quad こたえ \\kpbox{二等辺三角形}}",
        "\\kpqfull{(3)}{正三角形の 3つの 角の 大きさは すべて \\kpbox{おなじ}}",
      ].join("\n");
    })() });

  // ⑮ (2,3けた)×(2けた)
  add(calcPrint({ grade: G, id: "g3-15", unitNo: 15, name: "算数3年⑮ (2,3けた)×(2けた)", title: "(2,3けた)×(2けた)", subtitle: "かけ算の ひっ算", goal: "2けた・3けた×2けたの かけ算が できるように なろう！", desc: "(2,3位数)×(2位数)の筆算。" }, (rng) => [...genMulBig(rng, 8, { amin: 12, amax: 99, bmin: 11, bmax: 99 }), ...genMulBig(rng, 8, { amin: 102, amax: 899, bmin: 11, bmax: 99 })], 2));

  // ⑯ 分数
  add(calcPrint({ grade: G, id: "g3-16", unitNo: 16, name: "算数3年⑯ 分数", title: "分数", subtitle: "同じ 分母の たしひき", goal: "同じ 分母の 分数の たし算・ひき算を しよう！", desc: "分数の意味、同分母分数の加減。" }, (rng) => genFracSame(rng, 12), 2));

  // ⑰ 重さ
  add({ grade: G, subject: "算数", id: "g3-17", unitNo: 17, name: "算数3年⑰ 重さ", title: "重さ", subtitle: "kg と g", goal: "kg と g の かんけいを おぼえよう！", desc: "重さの単位kg,g。1kg=1000g。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{1 kg $=$ \\kpbox{1000} g}",
      "\\kpitemx{(2)}{2 kg 500 g $=$ \\kpbox{2500} g}",
      "\\kpitemx{(3)}{3000 g $=$ \\kpbox{3} kg}",
      "\\kpitemx{(4)}{1 kg 200 g $=$ \\kpbox{1200} g}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑱ □を使った式
  add({ grade: G, subject: "算数", id: "g3-18", unitNo: 18, name: "算数3年⑱ □を つかった 式", title: "□を つかった 式", subtitle: "わからない数を もとめる", goal: "□に あう 数を もとめる れんしゅうを しよう！", desc: "未知数を□にして式に表し、求める。",
    body: [
      "\\kpsection{$\\square$ に あう数を かきましょう}",
      "\\begin{kpgrid}{2}",
      "\\kpitemx{(1)}{$\\square+15=40$\\quad $\\square=$ \\kpbox{25}}",
      "\\kpitemx{(2)}{$\\square-12=20$\\quad $\\square=$ \\kpbox{32}}",
      "\\kpitemx{(3)}{$8\\times\\square=56$\\quad $\\square=$ \\kpbox{7}}",
      "\\kpitemx{(4)}{$\\square\\div4=6$\\quad $\\square=$ \\kpbox{24}}",
      "\\kpitemx{(5)}{$30-\\square=18$\\quad $\\square=$ \\kpbox{12}}",
      "\\kpitemx{(6)}{$\\square\\div7=8$\\quad $\\square=$ \\kpbox{56}}",
      "\\end{kpgrid}",
    ].join("\n") });

  // ⑲ わり算の れんしゅう
  add(calcPrint({ grade: G, id: "g3-19", unitNo: 19, name: "算数3年⑲ わり算の れんしゅう", title: "わり算の れんしゅう", subtitle: "あまりなし・あまりあり ミックス", goal: "わり算を すらすら できるように なろう！", desc: "除法の習熟(余りなし・余りあり混合)。" }, (rng) => [...genDiv(rng, 12, { bmin: 2, bmax: 9 }), ...genDivRem(rng, 12)], 3));

  // ⑳ 3年のまとめ
  add(calcPrint({ grade: G, id: "g3-20", unitNo: 20, name: "算数3年⑳ 3年の まとめ", title: "3年の まとめ", subtitle: "かけ算・わり算・ひっ算", goal: "3年で ならった けいさんの しあげ！ ぜんぶ できるかな？", desc: "3年の計算の総合復習。" }, (rng) => [...genDiv(rng, 6, { bmin: 2, bmax: 9 }), ...genMulBig(rng, 6, { amin: 13, amax: 89, bmin: 3, bmax: 9 }), ...genAddN(rng, 3, { min: 234, max: 4899 }), ...genSubN(rng, 3, { min: 412, max: 8999 })], 2));

  return P;
}

export const prints = [...buildG1(), ...buildG2(), ...buildG3()];
