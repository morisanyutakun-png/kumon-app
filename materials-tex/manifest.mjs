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
function calcItems(probs, offset = 0) {
  return probs.map((p, i) => `\\kpitem{(${i + 1 + offset})}{$${p.expr}$}{${p.ans}}`);
}
// 低学年の「数える」用: 指定の絵を n こ 横に並べた小さな図を返す。
//   type: apple / star / heart / flower / fish / ball / cube / dot
const SHAPE_LABEL = {
  apple: "りんご", orange: "みかん", berry: "いちご",
  cat: "ねこ", dog: "いぬ", rabbit: "うさぎ", bear: "くま",
  car: "くるま", fish: "おさかな",
  star: "ほし", heart: "ハート", flower: "おはな", ball: "ボール", cube: "つみき", dot: "",
};
// 数える単位(助数詞)。題材に合わせて自然に。
const SHAPE_UNIT = {
  apple: "こ", orange: "こ", berry: "こ", ball: "こ", star: "こ", heart: "こ",
  flower: "本", cat: "ひき", dog: "ひき", rabbit: "わ", bear: "ひき", fish: "ひき", car: "だい",
};
// テーマ別の題材プール(くだもの/どうぶつ/のりもの…)。
const SHAPE_THEMES = {
  くだもの: ["apple", "orange", "berry"],
  どうぶつ: ["cat", "dog", "rabbit", "bear", "fish"],
  のりもの: ["car"],
  たのしい: ["star", "heart", "flower", "ball"],
};
function shapeRow(type, n, scale = 0.55) {
  // 横の間隔は全種類でそろえ(中心間 1.25)、絵が重ならないようにする。
  const STEP = 1.25;
  const x = (i) => (i * STEP).toFixed(2);
  const named = ["apple", "orange", "berry", "cat", "dog", "rabbit", "bear", "car", "fish", "star", "heart", "flower"];
  let draw;
  if (named.includes(type)) {
    const cmd = "\\kp" + type;
    draw = (i) => `${cmd}{${x(i)}}{0}`;
  } else if (type === "ball") {
    draw = (i) => `\\kpball{${x(i)}}{0}{cyan!55!blue!70}`;
  } else {
    draw = (i) => `\\fill[accent] (${x(i)},0) circle (0.26);`;
  }
  let s = "";
  for (let i = 0; i < n; i++) s += draw(i);
  // 各図の中心をベースラインに合わせ、さらに少し持ち上げて行の中央に置く
  // (形ごとの高さ差があっても文字と縦position が揃う)。
  return `\\raisebox{0.4ex}{\\begin{tikzpicture}[scale=${scale}, baseline=(current bounding box.center)]${s}\\end{tikzpicture}}`;
}
// 1問分(数える)を作る。左=絵+問い / 右=解答欄。
function countQ(no, type, n) {
  const u = SHAPE_UNIT[type] ?? "こ";
  return `\\kpQ{(${no})}{${shapeRow(type, n)}\\ \\ ${SHAPE_LABEL[type]}は いくつ あるかな。}{\\kpAR{}{${n} ${u}}}`;
}
// 大問セクション(右側に解答欄を持つ kpsheet)。no=大問番号 / rows=\kpQ の配列。
function sheetSection(no, title, rows) {
  return `\\kpprompt{${no}}{${title}}\n\\begin{kpsheet}\n${rows.join("\n")}\n\\end{kpsheet}`;
}
// 計算セクション(各問の「=」の うしろに 解答ボックス。多段組み)。
function calcGridSection(no, title, probs, cols = 3) {
  const items = probs.map((p, i) => `\\kpitem{(${i + 1})}{$${p.expr}$}{${p.ans}}`);
  return `\\kpprompt{${no}}{${title}}\n${grid(items, cols)}`;
}
// 番号付き計算問題1問(右解答欄つき・g1-01 と同じ右列レイアウト)。
function calcQ(no, p) {
  return `\\kpQ{(${no})}{$${p.expr}$}{\\kpAR{}{${p.ans}}}`;
}
// 絵を使った たし算/ひき算 の1問(右解答欄つき)。
//   op: "+" あわせて / "-take" のこり / "-diff" ちがい
function picCalcQ(no, type, a, b, op) {
  const u = SHAPE_UNIT[type] ?? "こ";
  let q, ans;
  if (op === "+") {
    ans = a + b;
    q = `${shapeRow(type, a)}\\ \\ と ${shapeRow(type, b)}\\ \\ を あわせると なんこに なりますか。`;
  } else if (op === "-take") {
    ans = a - b;
    q = `${shapeRow(type, a)}\\ \\ から ${b}こ とると、のこりは なんこですか。`;
  } else {
    ans = a - b;
    q = `${shapeRow(type, a)}\\ \\ と ${shapeRow(type, b)}\\ \\ の かずの ちがいは なんこですか。`;
  }
  return `\\kpQ{(${no})}{${q}}{\\kpAR{}{${ans} ${u}}}`;
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
      // いろいろな 題材(くだもの・どうぶつ・のりもの…)を かぞえる。数は10まで。
      const cMix = [["apple", 3], ["cat", 5], ["car", 4], ["orange", 7], ["rabbit", 6], ["star", 9]];
      const cRows = cMix.map(([t, n], i) => countQ(i + 1, t, n)).join("\n");
      const seq = uniqueProbs(rng, 4, () => {
        const a = ri(rng, 1, 6);
        return { expr: `${a},\\ ${a + 1},\\ \\square,\\ ${a + 3}`, ans: a + 2 };
      });
      const sRows = seq
        .map((p, i) => `\\kpQ{(${i + 1})}{$${p.expr}$ \\ の $\\square$ に あう かず。}{\\kpAR{}{${p.ans}}}`)
        .join("\n");
      return [
        "\\kpprompt{1}{いくつ あるかな。すうじで かこう}",
        `\\begin{kpsheet}\n${cRows}\n\\end{kpsheet}`,
        "\\kpprompt{2}{$\\square$ に あう かずを かこう}",
        `\\begin{kpsheet}\n${sRows}\n\\end{kpsheet}`,
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
      const partOf = uniqueProbs(rng, 6, () => {
        const n = ri(rng, 5, 10);
        const a = ri(rng, 1, n - 1);
        return { expr: `${n} は ${a} と いくつですか。`, ans: `${n - a}` };
      });
      // 「□ と B で N」型
      const makeN = uniqueProbs(rng, 5, () => {
        const n = ri(rng, 5, 10);
        const b = ri(rng, 1, n - 1);
        return { expr: `□ と ${b} で ${n} に なる □は いくつですか。`, ans: `${n - b}` };
      });
      return iplusBody(
        [...partOf, ...makeN].map((p) => ({ q: p.expr, a: p.ans })),
        { section: "□に あう かずを かきましょう" },
      );
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
      const pics = [["apple", 2, 1], ["berry", 3, 2], ["star", 2, 3], ["ball", 4, 2]]
        .map((p, i) => picCalcQ(i + 1, p[0], p[1], p[2], "+"));
      const calc = genAdd(rng, 12, { maxSum: 6 });
      return [
        sheetSection(1, "えを 見て、あわせると なんこに なるか こたえましょう", pics),
        calcGridSection(2, "つぎの けいさんを しましょう", calc),
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
      const pics = [["apple", 4, 3], ["orange", 5, 4], ["rabbit", 6, 2], ["star", 3, 5]]
        .map((p, i) => picCalcQ(i + 1, p[0], p[1], p[2], "+"));
      const calc = genAdd(rng, 12, { maxSum: 10 });
      return [
        sheetSection(1, "えを 見て、ぜんぶで なんこに なるか こたえましょう", pics),
        calcGridSection(2, "つぎの けいさんを しましょう", calc),
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
      const pics = [["apple", 5, 2], ["fish", 6, 4], ["berry", 7, 3], ["car", 8, 5]]
        .map((p, i) => picCalcQ(i + 1, p[0], p[1], p[2], "-take"));
      const calc = genSub(rng, 12, { max: 10 });
      return [
        sheetSection(1, "えを 見て、のこりは なんこか こたえましょう", pics),
        calcGridSection(2, "つぎの けいさんを しましょう", calc),
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
      const pics = [["apple", 5, 2], ["berry", 7, 3], ["star", 6, 4], ["ball", 8, 5]]
        .map((p, i) => picCalcQ(i + 1, p[0], p[1], p[2], "-diff"));
      const calc = genSub(rng, 12, { max: 10 });
      return [
        sheetSection(1, "えを 見て、かずの ちがいは なんこか こたえましょう", pics),
        calcGridSection(2, "つぎの けいさんを しましょう", calc),
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
        "\\kpprompt{1}{ひだりから かぞえて こたえましょう}",
        `\\begin{center}{\\Large ${animals}}\\end{center}\\vspace{1mm}`,
        "{\\large ★が ひだりから ならんで います。}\\par\\vspace{2mm}",
        "\\begin{kpsheet}",
        "\\kpQ{(1)}{ひだりから 3ばんめの ★を ○で かこみましょう。それは みぎから かぞえると なんばんめですか。}{\\kpAR{}{5 ばんめ}}",
        "\\kpQ{(2)}{★は ぜんぶで なんこ ありますか。}{\\kpAR{}{7 こ}}",
        "\\kpQ{(3)}{ひだりから 5こを ○で かこむと、のこりは なんこですか。}{\\kpAR{}{2 こ}}",
        "\\kpQ{(4)}{みぎから 2ばんめは、ひだりから かぞえると なんばんめですか。}{\\kpAR{}{6 ばんめ}}",
        "\\kpQ{(5)}{みぎから 4ばんめは、ひだりから かぞえると なんばんめですか。}{\\kpAR{}{4 ばんめ}}",
        "\\kpQ{(6)}{みぎから 1ばんめは、ひだりから かぞえると なんばんめですか。}{\\kpAR{}{7 ばんめ}}",
        "\\end{kpsheet}",
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
      return calcBodyInline([...t10, ...add2, ...sub2]);
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
        [3, 0, "3じ"], [8, 0, "8じ"], [6, 30, "6じはん"],
        [10, 0, "10じ"], [1, 30, "1じはん"], [12, 0, "12じ"],
      ];
      const rows = clocks.map(([h, m, ans], i) =>
        `\\kpQ{(${i + 1})}{\\raisebox{-9mm}{\\kpclock{${h}}{${m}}}\\ \\ いま なんじですか。}{\\kpAR{}{${ans}}}`);
      return sheetSection(1, "とけいを よんで、なんじか こたえましょう", rows);
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
      return calcBodyInline([...addadd, ...subsub, ...mix]);
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
      const ex = [[9, 4], [8, 5], [7, 6]].map(([a, b], i) => {
        const need = 10 - a;
        return `\\kpQ{(${i + 1})}{\\raisebox{-7mm}{\\kptenframe{${a}}}\\ \\ $${a}+${b}$ を、${a} に あと ${need} で 10 を つくって けいさんしましょう。}{\\kpAR{}{${a + b}}}`;
      });
      const calc = genAddCarry(rng, 12, { maxSum: 14 });
      return [
        sheetSection(1, "10の まとまりを つくって けいさんしましょう", ex),
        calcGridSection(2, "つぎの けいさんを しましょう", calc),
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
      return calcBodyInline(genAddCarry(rng, 40, { maxSum: 18 }));
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
      return calcBodyInline(genSubBorrow(rng, 40, { max: 14 }));
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
      return calcBodyInline(genSubBorrow(rng, 40, { max: 18 }));
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
      return calcBodyInline([...tens, ...tensSub, ...d2]);
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
      const items = [
        ["あめが 6こ あります。4こ もらいました。ぜんぶで なんこに なりましたか。", "6+4=10", "10 こ"],
        ["こうえんに こどもが 8にん います。3にん かえりました。のこりは なんにんですか。", "8-3=5", "5 にん"],
        ["あかい はなが 5ほん、しろい はなが 7ほん さいています。あわせて なんぼんですか。", "5+7=12", "12 ほん"],
        ["どんぐりを 13こ ひろいました。5こ つかいました。のこりは なんこですか。", "13-5=8", "8 こ"],
        ["バスに 7にん のっています。ていりゅうじょで 4にん のってきました。みんなで なんにんですか。", "7+4=11", "11 にん"],
        ["おかしが 12こ あります。5こ たべました。のこりは なんこですか。", "12-5=7", "7 こ"],
      ];
      const rows = items
        .map(([q, eq, a], i) => `\\kpQ{(${i + 1})}{${q}}{\\kpAR{しき}{$${eq}$}\\kpAR{こたえ}{${a}}}`)
        .join("\n");
      return `\\kpprompt{1}{おはなしを よんで、しきと こたえを かきましょう}\n\\begin{kpsheet}\n${rows}\n\\end{kpsheet}`;
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
        "\\kpprompt{1}{かたちを かぞえましょう}",
        `\\begin{center}${shapeRow}\\end{center}\\vspace{3mm}`,
        "\\begin{kpsheet}",
        "\\kpQ{(1)}{しかく(\\textcolor{accent}{$\\blacksquare$})は いくつ ありますか。}{\\kpAR{}{2 つ}}",
        "\\kpQ{(2)}{まる(\\textcolor{kpgreen}{$\\bullet$})は いくつ ありますか。}{\\kpAR{}{3 つ}}",
        "\\kpQ{(3)}{さんかく(\\textcolor{kpink}{$\\blacktriangle$})は いくつ ありますか。}{\\kpAR{}{2 つ}}",
        "\\kpQ{(4)}{いちばん おおい かたちは どれですか。}{\\kpAR{}{まる}}",
        "\\kpQ{(5)}{かたちは ぜんぶで いくつ ありますか。}{\\kpAR{}{7 つ}}",
        "\\kpQ{(6)}{しかくと さんかくを あわせると いくつ ありますか。}{\\kpAR{}{4 つ}}",
        "\\end{kpsheet}",
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
        ...genAdd(rng, 7, { maxSum: 10 }),
        ...genAddCarry(rng, 9, { maxSum: 18 }),
        ...genSub(rng, 7, { max: 10 }),
        ...genSubBorrow(rng, 9, { max: 18 }),
      ];
      return calcBodyInline(mix);
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
      const pile = (cols, scale = 0.4) => {
        let tk = "";
        cols.forEach((h, c) => { for (let y = 0; y < h; y++) tk += `\\kpcube{${c}}{${y}}`; });
        return `\\raisebox{-3mm}{\\begin{tikzpicture}[scale=${scale}]${tk}\\end{tikzpicture}}`;
      };
      const piles = [[3], [2, 2], [1, 2], [2, 1, 2], [3, 2], [2, 3, 1], [3, 3]];
      return iplusBody(
        piles.map((cols) => ({ q: `${pile(cols)}\\ \\ つみきは いくつ あるかな。`, a: `${cols.reduce((x, y) => x + y, 0)} こ` })),
        { section: "つみきは いくつ あるかな。かぞえて かこう" },
      );
    })(),
  });

  // ⑳ えで かぞえよう -------------------------------------------------------
  add({
    id: "g1-20",
    unitNo: 20,
    name: "算数1年⑳ えで かぞえよう",
    title: "えで かぞえよう",
    subtitle: "いろいろな ものを かぞえる",
    goal: "くだものや どうぶつ、のりものが いくつ あるか、かぞえて すうじで かこう！",
    desc: "具体物(半具体物)を数えて数量をとらえる。並んだ絵の計数。",
    body: (() => {
      // くだもの・どうぶつ・のりもの・たのしい から いろいろ。数は10まで。
      const mix = [["berry", 4], ["dog", 6], ["car", 5], ["fish", 8], ["bear", 3], ["flower", 7], ["orange", 9], ["heart", 6]];
      const rows = mix.map(([t, n], i) => countQ(i + 1, t, n)).join("\n");
      return ["\\kpprompt{1}{いくつ あるかな。かぞえて かこう}", `\\begin{kpsheet}\n${rows}\n\\end{kpsheet}`].join("\n");
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
// 少数問の計算ドリル本文(アイプラス風: 左=問題 / 右=行対応の解答欄)。
//   問題数が少ない(〜十数問)ときに使う。\kpsheet が縦に均等配置して紙面を埋める。
function calcBody(probs, section = "つぎの けいさんを しましょう") {
  const rows = probs
    .map((p, i) => `\\kpQ{(${i + 1})}{$${p.expr}$}{\\kpAR{}{${p.ans}}}`)
    .join("\n");
  return `\\kpprompt{1}{${section}}\n\\begin{kpsheet}\n${rows}\n\\end{kpsheet}`;
}
// 左の問題リストの列数(短い式=2列 / 分数など幅広=1列)。
function drillLeftCols(cols) {
  return cols >= 3 ? 2 : 1;
}
// 1ページに並べる問題数(=のうしろに解答ボックスを置く多段組み)。
function drillPerPage(cols) {
  return cols >= 3 ? 30 : 24;
}
// 配列を縦割り(列メジャー)で ncol 列の横並びミニページにする。
// multicol はミニページ/ボックス内で balance しないため手組みする。
function colBlock(items, ncol, render) {
  const per = Math.ceil(items.length / ncol);
  const w = (0.96 / ncol).toFixed(3);
  const cols = [];
  for (let c = 0; c < ncol; c++) {
    const slice = items.slice(c * per, (c + 1) * per);
    const body = slice.map((it, j) => render(it, c * per + j)).join("");
    cols.push(`\\begin{minipage}[t]{${w}\\linewidth}${body}\\end{minipage}`);
  }
  return cols.join("\\hfill");
}
// ドリル1ページ分の TeX(各問の「=」の うしろに 解答ボックスを置く。多段組み)。
function drillPageTeX(probs, cols, section, offset = 0) {
  const items = probs.map((p, i) => `\\kpitem{(${i + 1 + offset})}{$${p.expr}$}{${p.ans}}`);
  return `\\kpprompt{1}{${section}}\n${grid(items, cols)}`;
}
// 計算ドリル本文(1ページ分・右側に解答欄)。
function calcBodyInline(probs, cols = 3, section = "つぎの けいさんを しましょう") {
  return drillPageTeX(probs.slice(0, drillPerPage(cols)), cols, section, 0);
}
// 問題リストを1ページ分ずつに分け、ページ配列にする(複数ページ対応)。
function calcPages(probs, cols, section) {
  const per = drillPerPage(cols);
  const chunks = [];
  for (let i = 0; i < probs.length; i += per) chunks.push(probs.slice(i, i + per));
  if (chunks.length === 0) chunks.push([]);
  return chunks.map((ch, pi) => drillPageTeX(ch, cols, section, pi * per));
}
// 計算ドリルを作る。量を重視して、ジェネレータを繰り返し呼び重複排除した
// 大きな問題プール(既定で約2ページ分)を作り、複数ページに分割する。
//   cols 未指定なら 3列(短い式)。分数など幅広の式は呼び出し側で 2 を渡す。
//   pages: めざすページ数(既定2)。小さい数のドリルなどユニーク数が足りなければ
//          自動的に作れる分だけ(1ページ等)になる。
function calcPrint(def, gen, cols = 3, section = "つぎの けいさんを しましょう", { pages = 2 } = {}) {
  const rng = rngFromString(def.id);
  const target = drillPerPage(cols) * pages;
  const seen = new Set();
  const pool = [];
  let guard = 0;
  while (pool.length < target && guard++ < 40) {
    const batch = gen(rng);
    let added = 0;
    for (const p of batch) {
      if (!seen.has(p.expr)) {
        seen.add(p.expr);
        pool.push(p);
        added++;
      }
    }
    if (added === 0) break; // ユニークが尽きた
  }
  const items = pool.slice(0, target);
  return { subject: "算数", ...def, pages: calcPages(items, cols, section) };
}

// アイプラス風の概念・文章題プリント本文。
//   左=番号付きの問題文 / 右=解答欄(箱)。解答版では箱に赤字で答えが入る。
//   items: [{ q: "問題文(TeX)", a: "答え(TeX)" }]
//   opts.section : 上部の指示文(\kpprompt の見出し)
//   opts.intro   : 全幅の導入ブロック(データ・図など、kpsheet の前に置く)。任意。
function iplusBody(items, { section = "つぎの もんだいに こたえましょう", intro = null } = {}) {
  const head = `\\kpprompt{1}{${section}}\n`;
  const introBlock = intro ? `${intro}\\par\\vspace{3mm}\n` : "";
  const rows = items
    .map((it, i) => `\\kpQ{(${i + 1})}{${it.q}}{\\kpAR{}{${it.a}}}`)
    .join("\n");
  return `${head}${introBlock}\\begin{kpsheet}\n${rows}\n\\end{kpsheet}`;
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
    body: iplusBody([
      { q: "いちばん おおい くだものは どれですか。", a: "みかん" },
      { q: "いちばん すくない くだものは どれですか。", a: "ぶどう" },
      { q: "りんごと いちごは あわせて なんにんですか。", a: "9 にん" },
      { q: "みかんは ぶどうより なんにん おおいですか。", a: "3 にん" },
      { q: "ぜんぶで なんにん しらべましたか。", a: "18 にん" },
      { q: "りんごは ぶどうより なんにん おおいですか。", a: "1 にん" },
    ], { section: "ひょうと グラフを よんで こたえましょう", intro: "{\\large すきな くだもの しらべ\\quad りんご … 4にん ／ みかん … 6にん ／ ぶどう … 3にん ／ いちご … 5にん}\\par\\vspace{1mm}\\begin{kpgraph}{5}{7}\\kpgx{1}{り}\\kpgx{2}{み}\\kpgx{3}{ぶ}\\kpgx{4}{い}\\kpgy{2}{2}\\kpgy{4}{4}\\kpgy{6}{6}\\kpgbar{1}{4}\\kpgbar{2}{6}\\kpgbar{3}{3}\\kpgbar{4}{5}\\end{kpgraph}" }) });

  // ② 時こくと時間(1)
  add({ grade: G, subject: "算数", id: "g2-02", unitNo: 2, name: "算数2年② 時こくと 時間 (1)", title: "とけいを よもう", subtitle: "なんじ なんぷん",
    goal: "とけいの ながいはりを よんで「なんじ なんぷん」が わかるように なろう！", desc: "時刻の読み方(何時何分)。1日の時間、午前・午後。",
    body: (() => {
      const clocks = [[3, 15, "3 じ 15 ふん"], [8, 40, "8 じ 40 ぷん"], [10, 5, "10 じ 5 ふん"], [6, 30, "6 じ 30 ぷん"], [1, 50, "1 じ 50 ぷん"], [12, 20, "12 じ 20 ぷん"]];
      return iplusBody(
        clocks.map(([h, m, ans]) => ({ q: `\\raisebox{-7mm}{\\kpclock{${h}}{${m}}}`, a: ans })),
        { section: "とけいを よんで、なんじ なんぷんか こたえましょう" },
      );
    })() });

  // ③ 2けたのたし算(暗算)
  add(calcPrint({ grade: G, id: "g2-03", unitNo: 3, name: "算数2年③ 2けたの たし算", title: "2けたの たし算", subtitle: "くり上がりの ない あんざん", goal: "2けたの たし算を、あたまの なかで すばやく できるように なろう！", desc: "(2位数)+(1,2位数)で繰り上がりのない加法。" }, (rng) => genAddN(rng, 40, { min: 11, max: 88, carry: false })));

  // ④ たし算のひっ算
  add(calcPrint({ grade: G, id: "g2-04", unitNo: 4, name: "算数2年④ たし算の ひっ算", title: "たし算の ひっ算", subtitle: "くり上がりの ある たし算", goal: "くり上がりの ある 2けたの たし算を、ひっ算で できるように なろう！", desc: "繰り上がりのある(2位数)+(2位数)の筆算。" }, (rng) => genAddN(rng, 40, { min: 13, max: 89, carry: true })));

  // ⑤ ひき算のひっ算
  add(calcPrint({ grade: G, id: "g2-05", unitNo: 5, name: "算数2年⑤ ひき算の ひっ算", title: "ひき算の ひっ算", subtitle: "くり下がりの ある ひき算", goal: "くり下がりの ある 2けたの ひき算を、ひっ算で できるように なろう！", desc: "繰り下がりのある(2位数)-(1,2位数)の筆算。" }, (rng) => genSubN(rng, 40, { min: 21, max: 99, borrow: true })));

  // ⑥ 1000までの数
  add({ grade: G, subject: "算数", id: "g2-06", unitNo: 6, name: "算数2年⑥ 1000までの 数", title: "1000までの 数", subtitle: "数の しくみ", goal: "100が いくつ、10が いくつ…で 数を かんがえよう！", desc: "1000までの数の構成・読み方・書き方。",
    body: iplusBody([
      { q: "100が 3こ、10が 5こ、1が 8こ で いくつですか。", a: "358" },
      { q: "100が 6こ、10が 0こ、1が 4こ で いくつですか。", a: "604" },
      { q: "100が 7こ で いくつですか。", a: "700" },
      { q: "472は 100が 何こ、10が 何こ、1が 何こ ですか。", a: "100が4こ・10が7こ・1が2こ" },
      { q: "990より 10 大きい数は いくつですか。", a: "1000" },
      { q: "640は 10を 何こ あつめた数ですか。", a: "64 こ" },
    ], { section: "数の しくみを かんがえましょう" }) });

  // ⑦ 大きい数のたし算とひき算
  add(calcPrint({ grade: G, id: "g2-07", unitNo: 7, name: "算数2年⑦ 大きい数の たし算と ひき算", title: "大きい数の けいさん", subtitle: "3けたの たし算・ひき算", goal: "3けたの たし算・ひき算を ひっ算で できるように なろう！", desc: "(3位数)±(2,3位数)の筆算。" }, (rng) => [...genAddN(rng, 18, { min: 105, max: 899 }), ...genSubN(rng, 18, { min: 120, max: 999 })], 2));

  // ⑧ 長さ(1) cm mm
  add({ grade: G, subject: "算数", id: "g2-08", unitNo: 8, name: "算数2年⑧ 長さ (1) cm と mm", title: "長さ (cm と mm)", subtitle: "1cm = 10mm", goal: "cm と mm の かんけいを おぼえて、長さを あらわそう！", desc: "長さの単位cm,mm。1cm=10mm。",
    body: iplusBody([
      { q: "1 cm は 何 mm ですか。", a: "10 mm" },
      { q: "4 cm は 何 mm ですか。", a: "40 mm" },
      { q: "3 cm 5 mm は 何 mm ですか。", a: "35 mm" },
      { q: "60 mm は 何 cm ですか。", a: "6 cm" },
      { q: "8 cm 2 mm は 何 mm ですか。", a: "82 mm" },
      { q: "47 mm は 何 cm 何 mm ですか。", a: "4 cm 7 mm" },
    ], { section: "長さ(cm と mm)を もとめましょう" }) });

  // ⑨ 水のかさ
  add({ grade: G, subject: "算数", id: "g2-09", unitNo: 9, name: "算数2年⑨ 水の かさ", title: "水の かさ", subtitle: "L・dL・mL", goal: "L・dL・mL の かんけいを おぼえよう！", desc: "かさの単位L,dL,mL。1L=10dL=1000mL。",
    body: iplusBody([
      { q: "1 L は 何 dL ですか。", a: "10 dL" },
      { q: "1 dL は 何 mL ですか。", a: "100 mL" },
      { q: "1 L は 何 mL ですか。", a: "1000 mL" },
      { q: "3 L 2 dL は 何 dL ですか。", a: "32 dL" },
      { q: "50 dL は 何 L ですか。", a: "5 L" },
      { q: "2 L は 何 mL ですか。", a: "2000 mL" },
    ], { section: "水の かさを もとめましょう" }) });

  // ⑩ 三角形と四角形
  add({ grade: G, subject: "算数", id: "g2-10", unitNo: 10, name: "算数2年⑩ 三角形と 四角形", title: "三角形と 四角形", subtitle: "へん・ちょうてん・直角", goal: "三角形や 四角形の かたちを しらべよう！", desc: "三角形・四角形の意味、辺・頂点、直角。",
    body: (() => {
      const pic = "\\begin{tikzpicture}[scale=0.8]" +
        "\\draw[kpblue,line width=1.2pt] (0,0)--(1.6,0)--(0.8,1.3)--cycle;" +
        "\\draw[kpgreen,line width=1.2pt] (2.4,0) rectangle (3.9,1.3);" +
        "\\draw[kpink,line width=1.2pt] (4.6,0)--(6.4,0)--(6.0,1.2)--(4.9,1.2)--cycle;" +
        "\\end{tikzpicture}";
      return iplusBody([
        { q: "三角形の ちょうてんは いくつ ありますか。", a: "3 つ" },
        { q: "四角形の へんは いくつ ありますか。", a: "4 つ" },
        { q: "まんなかの かたちのように、4つの かどが みんな 直角な 四角形を なんと いいますか。", a: "長方形" },
        { q: "三角形の へんは いくつ ありますか。", a: "3 つ" },
        { q: "四角形の ちょうてんは いくつ ありますか。", a: "4 つ" },
        { q: "4つの かどが みんな 直角で、4つの へんが みんな 同じ 四角形を なんと いいますか。", a: "正方形" },
      ], { section: "かたちを しらべましょう", intro: `\\begin{center}${pic}\\end{center}` });
    })() });

  // ⑪ かけ算(1)
  add(calcPrint({ grade: G, id: "g2-11", unitNo: 11, name: "算数2年⑪ かけ算 (1)", title: "かけ算 (1)", subtitle: "2・3・4・5の だん", goal: "2・3・4・5の だんの 九九を おぼえよう！", desc: "乗法の意味。2,3,4,5の段の九九。" }, (rng) => genMul(rng, 40, { tables: [2, 5, 3, 4] })));

  // ⑫ かけ算(2)
  add(calcPrint({ grade: G, id: "g2-12", unitNo: 12, name: "算数2年⑫ かけ算 (2)", title: "かけ算 (2)", subtitle: "6・7・8・9・1の だん", goal: "6・7・8・9・1の だんの 九九を おぼえよう！", desc: "6〜9,1の段の九九。" }, (rng) => genMul(rng, 40, { tables: [6, 7, 8, 9, 1] })));

  // ⑬ かけ算(3) 九九ミックス
  add(calcPrint({ grade: G, id: "g2-13", unitNo: 13, name: "算数2年⑬ かけ算 (3) 九九ミックス", title: "九九 ミックス", subtitle: "ぜんぶの だん", goal: "ぜんぶの だんの 九九を すらすら いえるように なろう！", desc: "九九表。乗法の交換法則。" }, (rng) => genMul(rng, 40, { tables: [1, 2, 3, 4, 5, 6, 7, 8, 9] })));

  // ⑭ 分数
  add({ grade: G, subject: "算数", id: "g2-14", unitNo: 14, name: "算数2年⑭ 分数", title: "分数", subtitle: "1/2・1/3・1/4", goal: "ぜんたいを おなじ 大きさに わけた 1つぶんを 分数で あらわそう！", desc: "分数の意味(1/2,1/3,1/4)。",
    body: iplusBody([
      { q: "ぜんたいを 2つに わけた 1つぶんを 分数で かきましょう。", a: "$\\frac{1}{2}$" },
      { q: "ぜんたいを 4つに わけた 1つぶんを 分数で かきましょう。", a: "$\\frac{1}{4}$" },
      { q: "ぜんたいを 3つに わけた 1つぶんを 分数で かきましょう。", a: "$\\frac{1}{3}$" },
      { q: "$\\frac{1}{4}$ が 4こ で いくつですか。", a: "1" },
    ], { section: "分数で あらわしましょう" }) });

  // ⑮ 時こくと時間(2)
  add({ grade: G, subject: "算数", id: "g2-15", unitNo: 15, name: "算数2年⑮ 時こくと 時間 (2)", title: "時間の けいさん", subtitle: "1時間 = 60分", goal: "1時間=60分。 時間の かんけいを おぼえよう！", desc: "時間の計算。1時間=60分。",
    body: iplusBody([
      { q: "1 時間 は 何分ですか。", a: "60 分" },
      { q: "70 分 は 何時間何分ですか。", a: "1 時間 10 分" },
      { q: "2 時間 は 何分ですか。", a: "120 分" },
      { q: "午前 9時から 午前 11時までは 何時間ですか。", a: "2 時間" },
    ], { section: "時間を もとめましょう" }) });

  // ⑯ 10000までの数
  add({ grade: G, subject: "算数", id: "g2-16", unitNo: 16, name: "算数2年⑯ 10000までの 数", title: "10000までの 数", subtitle: "千のくらい", goal: "千のくらいまでの 大きい数を かんがえよう！", desc: "10000までの数の構成・読み方・書き方。",
    body: iplusBody([
      { q: "1000が 3こ、100が 5こ、10が 2こ、1が 7こ で いくつですか。", a: "3527" },
      { q: "2840は 1000が 何こ、100が 何こ、10が 何こ ですか。", a: "1000が2こ・100が8こ・10が4こ" },
      { q: "9000より 1000 大きい数は いくつですか。", a: "10000" },
      { q: "6000は 1000を 何こ あつめた数ですか。", a: "6 こ" },
    ], { section: "数の しくみを かんがえましょう" }) });

  // ⑰ 長さ(2) m
  add({ grade: G, subject: "算数", id: "g2-17", unitNo: 17, name: "算数2年⑰ 長さ (2) m", title: "長さ (m)", subtitle: "1m = 100cm", goal: "m と cm の かんけいを おぼえよう！", desc: "長さの単位m。1m=100cm。",
    body: iplusBody([
      { q: "1 m は 何 cm ですか。", a: "100 cm" },
      { q: "2 m 50 cm は 何 cm ですか。", a: "250 cm" },
      { q: "300 cm は 何 m ですか。", a: "3 m" },
      { q: "1 m 8 cm は 何 cm ですか。", a: "108 cm" },
    ], { section: "長さ(m と cm)を もとめましょう" }) });

  // ⑱ たし算とひき算(文章題)
  add({ grade: G, subject: "算数", id: "g2-18", unitNo: 18, name: "算数2年⑱ たし算と ひき算 (ぶんしょうだい)", title: "ぶんしょうだい", subtitle: "たし算・ひき算", goal: "おはなしを よんで、しきを かいて こたえよう！", desc: "場面を読み取り加減の式を立てる。",
    body: (() => {
      // 左=おはなし / 右=「しき」と「こたえ」の解答欄(g1と同じ右列配置)。
      const items = [
        ["あめが 45こ あります。28こ もらいました。ぜんぶで なんこですか。", "45+28=73", "73 こ"],
        ["りんごが 52こ ありました。17こ たべました。のこりは なんこですか。", "52-17=35", "35 こ"],
        ["いろえんぴつが 1はこ 12本 あります。3はこでは なん本ですか。", "12\\times3=36", "36 本"],
        ["おりがみが 60まい あります。24まい つかいました。のこりは なんまいですか。", "60-24=36", "36 まい"],
        ["あかい 花が 38本、しろい 花が 26本 あります。あわせて なん本ですか。", "38+26=64", "64 本"],
        ["1ふくろに あめが 8こ 入っています。5ふくろでは なんこですか。", "8\\times5=40", "40 こ"],
      ];
      const rows = items
        .map(([q, eq, a], i) => `\\kpQ{(${i + 1})}{${q}}{\\kpAR{しき}{$${eq}$}\\kpAR{こたえ}{${a}}}`)
        .join("\n");
      return `\\kpprompt{1}{おはなしを よんで、しきと こたえを かきましょう}\n\\begin{kpsheet}\n${rows}\n\\end{kpsheet}`;
    })() });

  // ⑲ はこの形
  add({ grade: G, subject: "算数", id: "g2-19", unitNo: 19, name: "算数2年⑲ はこの 形", title: "はこの 形", subtitle: "めん・へん・ちょうてん", goal: "はこの 形の めん・へん・ちょうてんの 数を しらべよう！", desc: "箱の形の構成要素(面・辺・頂点)。",
    body: (() => {
      const cube = "\\begin{tikzpicture}[scale=0.9]\\kpcube{0}{0}\\end{tikzpicture}";
      return iplusBody([
        { q: "はこの 形の めんは いくつ ありますか。", a: "6 つ" },
        { q: "ちょうてんは いくつ ありますか。", a: "8 つ" },
        { q: "へんは いくつ ありますか。", a: "12 つ" },
        { q: "さいころの ように、めんが みんな 正方形の はこの 形を なんと いいますか。", a: "立方体" },
        { q: "1つの ちょうてんに あつまる へんは 何本ですか。", a: "3 本" },
        { q: "むかいあう めんは 何くみ ありますか。", a: "3 くみ" },
      ], { section: "はこの 形を しらべましょう", intro: `\\begin{center}${cube}\\end{center}` });
    })() });

  // ⑳ 2年のまとめ
  add(calcPrint({ grade: G, id: "g2-20", unitNo: 20, name: "算数2年⑳ 2年の まとめ", title: "2年の まとめ", subtitle: "たし算・ひき算・九九", goal: "2年で ならった けいさんの しあげ！ ぜんぶ できるかな？", desc: "2年の計算の総合復習(筆算・九九)。" }, (rng) => [...genAddN(rng, 11, { min: 23, max: 89, carry: true }), ...genSubN(rng, 11, { min: 31, max: 99, borrow: true }), ...genMul(rng, 20, { tables: [3, 4, 6, 7, 8, 9] })]));

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
    body: iplusBody([
      { q: "$7\\times0$ を 計算しましょう。", a: "0" },
      { q: "$0\\times6$ を 計算しましょう。", a: "0" },
      { q: "$4\\times10$ を 計算しましょう。", a: "40" },
      { q: "$10\\times8$ を 計算しましょう。", a: "80" },
      { q: "$3\\times6=6\\times\\square$ の □に 入る数は いくつですか。", a: "3" },
      { q: "$5\\times7=5\\times6+\\square$ の □に 入る数は いくつですか。", a: "5" },
      { q: "$9\\times0$ を 計算しましょう。", a: "0" },
      { q: "$10\\times10$ を 計算しましょう。", a: "100" },
      { q: "$7\\times10$ を 計算しましょう。", a: "70" },
      { q: "$8\\times4=4\\times\\square$ の □に 入る数は いくつですか。", a: "8" },
    ], { section: "かけ算の きまりを つかって こたえましょう" }) });

  // ② 時こくと時間(1)
  add({ grade: G, subject: "算数", id: "g3-02", unitNo: 2, name: "算数3年② 時こくと 時間 (1)", title: "時間の けいさん", subtitle: "時こくと 時間", goal: "時こくと 時間の けいさんが できるように なろう！", desc: "時間の計算、日常生活と時刻。",
    body: iplusBody([
      { q: "午前 8時から 午後 3時までは 何時間ですか。", a: "7 時間" },
      { q: "40分 $+$ 30分 は 何時間何分ですか。", a: "1 時間 10 分" },
      { q: "1時間20分 は 何分ですか。", a: "80 分" },
      { q: "9時50分から 20分 たつと 何時何分ですか。", a: "10 時 10 分" },
      { q: "午前 9時から 午後 1時までは 何時間ですか。", a: "4 時間" },
      { q: "25分 $+$ 45分 は 何時間何分ですか。", a: "1 時間 10 分" },
      { q: "2時間15分 は 何分ですか。", a: "135 分" },
      { q: "100分 は 何時間何分ですか。", a: "1 時間 40 分" },
      { q: "7時40分から 30分 たつと 何時何分ですか。", a: "8 時 10 分" },
      { q: "午後 2時から 午後 6時30分までは 何時間何分ですか。", a: "4 時間 30 分" },
    ], { section: "時こくと 時間を もとめましょう" }) });

  // ③ わり算
  add(calcPrint({ grade: G, id: "g3-03", unitNo: 3, name: "算数3年③ わり算", title: "わり算", subtitle: "九九を つかって", goal: "九九を つかって わり算が できるように なろう！", desc: "除法の意味と答えの求め方(九九1回適用)。" }, (rng) => genDiv(rng, 40, { bmin: 2, bmax: 9 })));

  // ④ あまりのあるわり算
  add(calcPrint({ grade: G, id: "g3-04", unitNo: 4, name: "算数3年④ あまりの ある わり算", title: "あまりの ある わり算", subtitle: "わって あまりを だす", goal: "あまりの ある わり算が できるように なろう！", desc: "余りのある除法の意味と計算。" }, (rng) => genDivRem(rng, 36), 3));

  // ⑤ たし算とひき算(3,4けたの筆算)
  add(calcPrint({ grade: G, id: "g3-05", unitNo: 5, name: "算数3年⑤ たし算と ひき算 (ひっ算)", title: "大きい数の ひっ算", subtitle: "3けた・4けたの たし算ひき算", goal: "3けた・4けたの たし算・ひき算を ひっ算で できるように なろう！", desc: "(3,4位数)±(3,4位数)の筆算。" }, (rng) => [...genAddN(rng, 14, { min: 235, max: 4899 }), ...genSubN(rng, 14, { min: 412, max: 9999 })], 2));

  // ⑥ 表とグラフ
  add({ grade: G, subject: "算数", id: "g3-06", unitNo: 6, name: "算数3年⑥ 表と グラフ", title: "表と グラフ", subtitle: "ぼうグラフ", goal: "ぼうグラフを よんで、数を くらべよう！", desc: "棒グラフの読み方、表の整理。",
    body: iplusBody([
      { q: "いちばん おおく よんだ 曜日は どれですか。", a: "木" },
      { q: "いちばん 少なかった 曜日は どれですか。", a: "水" },
      { q: "月と 金では あわせて 何さつ よみましたか。", a: "7 さつ" },
      { q: "1しゅうかんで ぜんぶで 何さつ よみましたか。", a: "20 さつ" },
      { q: "木は 水より 何さつ 多いですか。", a: "4 さつ" },
      { q: "月・火・水 で あわせて 何さつ よみましたか。", a: "10 さつ" },
    ], { section: "ぼうグラフを よんで こたえましょう", intro: "{\\large 1しゅうかんに よんだ 本の さっすう(さつ)}\\par\\vspace{1mm}\\begin{kpgraph}{6}{7}\\kpgx{1}{月}\\kpgx{2}{火}\\kpgx{3}{水}\\kpgx{4}{木}\\kpgx{5}{金}\\kpgy{2}{2}\\kpgy{4}{4}\\kpgy{6}{6}\\kpgbar{1}{3}\\kpgbar{2}{5}\\kpgbar{3}{2}\\kpgbar{4}{6}\\kpgbar{5}{4}\\end{kpgraph}" }) });

  // ⑦ 長さ km
  add({ grade: G, subject: "算数", id: "g3-07", unitNo: 7, name: "算数3年⑦ 長さ (km)", title: "長さ (km)", subtitle: "1km = 1000m", goal: "km と m の かんけいを おぼえよう！", desc: "長さの単位km。1km=1000m。",
    body: iplusBody([
      { q: "1 km は 何 m ですか。", a: "1000 m" },
      { q: "2 km 300 m は 何 m ですか。", a: "2300 m" },
      { q: "1500 m は 何 km 何 m ですか。", a: "1 km 500 m" },
      { q: "3 km は 何 m ですか。", a: "3000 m" },
      { q: "5 km は 何 m ですか。", a: "5000 m" },
      { q: "4 km 50 m は 何 m ですか。", a: "4050 m" },
      { q: "2700 m は 何 km 何 m ですか。", a: "2 km 700 m" },
      { q: "6000 m は 何 km ですか。", a: "6 km" },
      { q: "800 m と 1 km 200 m を あわせると 何 km ですか。", a: "2 km" },
      { q: "1 km 999 m は 何 m ですか。", a: "1999 m" },
    ], { section: "長さ(km と m)に ついて こたえましょう" }) });

  // ⑧ (2けた)×(1けた)
  add(calcPrint({ grade: G, id: "g3-08", unitNo: 8, name: "算数3年⑧ (2けた)×(1けた)", title: "(2けた)×(1けた)", subtitle: "かけ算の ひっ算", goal: "2けた×1けたの かけ算が できるように なろう！", desc: "(2位数)×(1位数)の計算の仕方、筆算。" }, (rng) => genMulBig(rng, 36, { amin: 12, amax: 99, bmin: 2, bmax: 9 })));

  // ⑨ (3けた)×(1けた)
  add(calcPrint({ grade: G, id: "g3-09", unitNo: 9, name: "算数3年⑨ (3けた)×(1けた)", title: "(3けた)×(1けた)", subtitle: "かけ算の ひっ算", goal: "3けた×1けたの かけ算が できるように なろう！", desc: "(3位数)×(1位数)の筆算。" }, (rng) => genMulBig(rng, 36, { amin: 112, amax: 989, bmin: 2, bmax: 9 }), 2));

  // ⑩ 大きい数
  add({ grade: G, subject: "算数", id: "g3-10", unitNo: 10, name: "算数3年⑩ 大きい数", title: "大きい数", subtitle: "万の くらい", goal: "一万を こえる 大きい数を かんがえよう！", desc: "1億未満の数の構成・読み方。万。",
    body: iplusBody([
      { q: "10000が 4こで いくつですか。", a: "40000" },
      { q: "1000が 10こで いくつですか。", a: "10000" },
      { q: "53000は 1000を 何こ あつめた数ですか。", a: "53 こ" },
      { q: "38000より 2000 大きい数は いくつですか。", a: "40000" },
      { q: "$700\\times100$ を 計算しましょう。", a: "70000" },
      { q: "$60000\\div10$ を 計算しましょう。", a: "6000" },
      { q: "25000は 1000を 何こ あつめた数ですか。", a: "25 こ" },
      { q: "80000は 10000を 何こ あつめた数ですか。", a: "8 こ" },
      { q: "47000 の 千のくらいの 数字は 何ですか。", a: "7" },
      { q: "1000を 100こ あつめた数は いくつですか。", a: "100000" },
    ], { section: "大きい数に ついて こたえましょう" }) });

  // ⑪ 円と球
  add({ grade: G, subject: "算数", id: "g3-11", unitNo: 11, name: "算数3年⑪ 円と 球", title: "円と 球", subtitle: "半径・直径", goal: "円の 半径と 直径の かんけいを おぼえよう！", desc: "円の定義、中心・半径・直径の性質。",
    body: (() => {
      const pic = "\\begin{tikzpicture}[scale=0.9]\\draw[kpblue,line width=1.2pt](0,0)circle(1.2);\\fill(0,0)circle(1.5pt);\\draw[kpink,line width=1pt](0,0)--(1.2,0);\\node[font=\\small] at (0.6,0.22){はんけい};\\end{tikzpicture}";
      return iplusBody([
        { q: "半径 4cm の 円の 直径は 何 cm ですか。", a: "8 cm" },
        { q: "直径 10cm の 円の 半径は 何 cm ですか。", a: "5 cm" },
        { q: "直径は 半径の 何ばいですか。", a: "2 ばい" },
        { q: "半径 7cm の 円の 直径は 何 cm ですか。", a: "14 cm" },
        { q: "直径 20cm の 円の 半径は 何 cm ですか。", a: "10 cm" },
        { q: "ボールの ような まるい 形を 何と いいますか。", a: "球" },
        { q: "球を どこで 切っても 切り口は 何の 形に なりますか。", a: "円" },
        { q: "直径 16cm の ボールの 半径は 何 cm ですか。", a: "8 cm" },
      ], { section: "円に ついて こたえましょう", intro: `\\begin{center}${pic}\\end{center}` });
    })() });

  // ⑫ 時こくと時間(2) 秒
  add({ grade: G, subject: "算数", id: "g3-12", unitNo: 12, name: "算数3年⑫ 時こくと 時間 (2) 秒", title: "秒", subtitle: "1分 = 60秒", goal: "分と 秒の かんけいを おぼえよう！", desc: "短い時間、秒。1分=60秒。",
    body: iplusBody([
      { q: "1分は 何秒ですか。", a: "60 秒" },
      { q: "90秒は 何分何秒ですか。", a: "1 分 30 秒" },
      { q: "2分は 何秒ですか。", a: "120 秒" },
      { q: "1分45秒は 何秒ですか。", a: "105 秒" },
      { q: "3分は 何秒ですか。", a: "180 秒" },
      { q: "120秒は 何分ですか。", a: "2 分" },
      { q: "1分30秒は 何秒ですか。", a: "90 秒" },
      { q: "200秒は 何分何秒ですか。", a: "3 分 20 秒" },
      { q: "2分10秒は 何秒ですか。", a: "130 秒" },
      { q: "150秒は 何分何秒ですか。", a: "2 分 30 秒" },
    ], { section: "時間(分と 秒)に ついて こたえましょう" }) });

  // ⑬ 小数
  add(calcPrint({ grade: G, id: "g3-13", unitNo: 13, name: "算数3年⑬ 小数", title: "小数", subtitle: "小数第一位の たしひき", goal: "小数の たし算・ひき算が できるように なろう！", desc: "小数(第一位)の仕組みと加減。" }, (rng) => genDecimal(rng, 36), 3));

  // ⑭ 三角形と角
  add({ grade: G, subject: "算数", id: "g3-14", unitNo: 14, name: "算数3年⑭ 三角形と 角", title: "三角形と 角", subtitle: "二等辺三角形・正三角形", goal: "いろいろな 三角形の なまえを おぼえよう！", desc: "二等辺三角形・正三角形の定義、角。",
    body: (() => {
      const pic = "\\begin{tikzpicture}[scale=0.85]\\draw[kpblue,line width=1.2pt](0,0)--(1.4,0)--(0.7,1.2)--cycle;\\draw[kpink,line width=1.2pt](2.4,0)--(3.8,0)--(3.1,1.2)--cycle;\\end{tikzpicture}";
      return iplusBody([
        { q: "3つの へんの 長さが みんな おなじ 三角形を 何と いいますか。", a: "正三角形" },
        { q: "2つの へんの 長さが おなじ 三角形を 何と いいますか。", a: "二等辺三角形" },
        { q: "正三角形の 3つの 角の 大きさは どうなって いますか。", a: "すべて おなじ" },
        { q: "正三角形の 3つの へんの 長さは どうなって いますか。", a: "すべて おなじ" },
        { q: "二等辺三角形の 2つの 角の 大きさは どうなって いますか。", a: "おなじ(等しい)" },
        { q: "3つの 角が みんな 60度の 三角形を 何と いいますか。", a: "正三角形" },
        { q: "円の 半径を つかって へんを かくと、どんな 三角形が できますか。", a: "二等辺三角形" },
        { q: "コンパスは 何を するのに つかいますか。", a: "円を かく(長さを うつす)" },
      ], { section: "三角形に ついて こたえましょう", intro: `\\begin{center}${pic}\\end{center}` });
    })() });

  // ⑮ (2,3けた)×(2けた)
  add(calcPrint({ grade: G, id: "g3-15", unitNo: 15, name: "算数3年⑮ (2,3けた)×(2けた)", title: "(2,3けた)×(2けた)", subtitle: "かけ算の ひっ算", goal: "2けた・3けた×2けたの かけ算が できるように なろう！", desc: "(2,3位数)×(2位数)の筆算。" }, (rng) => [...genMulBig(rng, 14, { amin: 12, amax: 99, bmin: 11, bmax: 99 }), ...genMulBig(rng, 14, { amin: 102, amax: 899, bmin: 11, bmax: 99 })], 2));

  // ⑯ 分数
  add(calcPrint({ grade: G, id: "g3-16", unitNo: 16, name: "算数3年⑯ 分数", title: "分数", subtitle: "同じ 分母の たしひき", goal: "同じ 分母の 分数の たし算・ひき算を しよう！", desc: "分数の意味、同分母分数の加減。" }, (rng) => genFracSame(rng, 30), 2));

  // ⑰ 重さ
  add({ grade: G, subject: "算数", id: "g3-17", unitNo: 17, name: "算数3年⑰ 重さ", title: "重さ", subtitle: "kg と g", goal: "kg と g の かんけいを おぼえよう！", desc: "重さの単位kg,g。1kg=1000g。",
    body: iplusBody([
      { q: "1 kg は 何 g ですか。", a: "1000 g" },
      { q: "2 kg 500 g は 何 g ですか。", a: "2500 g" },
      { q: "3000 g は 何 kg ですか。", a: "3 kg" },
      { q: "1 kg 200 g は 何 g ですか。", a: "1200 g" },
      { q: "5 kg は 何 g ですか。", a: "5000 g" },
      { q: "4500 g は 何 kg 何 g ですか。", a: "4 kg 500 g" },
      { q: "2 kg は 何 g ですか。", a: "2000 g" },
      { q: "3 kg 50 g は 何 g ですか。", a: "3050 g" },
      { q: "800 g と 1 kg 300 g を あわせると 何 kg 何 g ですか。", a: "2 kg 100 g" },
      { q: "1 t は 何 kg ですか。", a: "1000 kg" },
    ], { section: "重さ(kg と g)に ついて こたえましょう" }) });

  // ⑱ □を使った式
  add({ grade: G, subject: "算数", id: "g3-18", unitNo: 18, name: "算数3年⑱ □を つかった 式", title: "□を つかった 式", subtitle: "わからない数を もとめる", goal: "□に あう 数を もとめる れんしゅうを しよう！", desc: "未知数を□にして式に表し、求める。",
    body: iplusBody([
      { q: "$\\square+15=40$ の □に 入る数を もとめましょう。", a: "25" },
      { q: "$\\square-12=20$ の □に 入る数を もとめましょう。", a: "32" },
      { q: "$8\\times\\square=56$ の □に 入る数を もとめましょう。", a: "7" },
      { q: "$\\square\\div4=6$ の □に 入る数を もとめましょう。", a: "24" },
      { q: "$30-\\square=18$ の □に 入る数を もとめましょう。", a: "12" },
      { q: "$\\square\\div7=8$ の □に 入る数を もとめましょう。", a: "56" },
      { q: "$\\square+8=23$ の □に 入る数を もとめましょう。", a: "15" },
      { q: "$45-\\square=27$ の □に 入る数を もとめましょう。", a: "18" },
      { q: "$6\\times\\square=42$ の □に 入る数を もとめましょう。", a: "7" },
      { q: "$\\square\\div5=9$ の □に 入る数を もとめましょう。", a: "45" },
    ], { section: "□に あう数を もとめましょう" }) });

  // ⑲ わり算の れんしゅう
  add(calcPrint({ grade: G, id: "g3-19", unitNo: 19, name: "算数3年⑲ わり算の れんしゅう", title: "わり算の れんしゅう", subtitle: "あまりなし・あまりあり ミックス", goal: "わり算を すらすら できるように なろう！", desc: "除法の習熟(余りなし・余りあり混合)。" }, (rng) => [...genDiv(rng, 20, { bmin: 2, bmax: 9 }), ...genDivRem(rng, 20)], 3));

  // ⑳ 3年のまとめ
  add(calcPrint({ grade: G, id: "g3-20", unitNo: 20, name: "算数3年⑳ 3年の まとめ", title: "3年の まとめ", subtitle: "かけ算・わり算・ひっ算", goal: "3年で ならった けいさんの しあげ！ ぜんぶ できるかな？", desc: "3年の計算の総合復習。" }, (rng) => [...genDiv(rng, 11, { bmin: 2, bmax: 9 }), ...genMulBig(rng, 11, { amin: 13, amax: 89, bmin: 3, bmax: 9 }), ...genAddN(rng, 5, { min: 234, max: 4899 }), ...genSubN(rng, 5, { min: 412, max: 8999 })], 2));

  return P;
}


// --- 追加の計算ジェネレータ (4・5・6年用) ---
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; }
const dec = (x, p = 2) => `${Math.round(x * 10 ** p) / 10 ** p}`;
function fracStr(n, d) { const g = gcd(n, d); n /= g; d /= g; return d === 1 ? `${n}` : `$\\frac{${n}}{${d}}$`; }
function genDivLong(rng, count, { dividendMax, divisorMax = 9 }) {
  return uniqueProbs(rng, count, () => {
    const b = ri(rng, 2, divisorMax);
    const q = ri(rng, 12, Math.max(13, Math.floor(dividendMax / b)));
    const r = rng() < 0.5 ? ri(rng, 1, b - 1) : 0;
    return { expr: `${b * q + r}\\div${b}=`, ans: r ? `${q}あまり${r}` : `${q}` };
  });
}
function genDiv2(rng, count) {
  return uniqueProbs(rng, count, () => {
    const b = ri(rng, 11, 39);
    const q = ri(rng, 2, 30);
    const r = rng() < 0.5 ? ri(rng, 1, b - 1) : 0;
    return { expr: `${b * q + r}\\div${b}=`, ans: r ? `${q}あまり${r}` : `${q}` };
  });
}
function genDecMulInt(rng, count) { return uniqueProbs(rng, count, () => { const a = ri(rng, 2, 99) / 10, b = ri(rng, 2, 9); return { expr: `${dec(a, 1)}\\times${b}=`, ans: dec(a * b, 1) }; }); }
function genDecDivInt(rng, count) { return uniqueProbs(rng, count, () => { const b = ri(rng, 2, 9), q = ri(rng, 2, 40) / 10; const a = Math.round(q * b * 10) / 10; return { expr: `${dec(a, 1)}\\div${b}=`, ans: dec(q, 1) }; }); }
function genDecMulDec(rng, count) { return uniqueProbs(rng, count, () => { const a = ri(rng, 2, 95) / 10, b = ri(rng, 2, 95) / 10; return { expr: `${dec(a, 1)}\\times${dec(b, 1)}=`, ans: dec(a * b, 2) }; }); }
function genDecDivDec(rng, count) { return uniqueProbs(rng, count, () => { const b = ri(rng, 2, 9) / 10, q = ri(rng, 2, 9); const a = Math.round(b * q * 10) / 10; return { expr: `${dec(a, 1)}\\div${dec(b, 1)}=`, ans: `${q}` }; }); }
function genFracDiff(rng, count) {
  return uniqueProbs(rng, count, () => {
    const d1 = ri(rng, 2, 6), d2 = ri(rng, 2, 6);
    if (d1 === d2) return null;
    const a = ri(rng, 1, d1 - 1), b = ri(rng, 1, d2 - 1);
    const L = (d1 * d2) / gcd(d1, d2);
    const na = a * (L / d1), nb = b * (L / d2);
    if (rng() < 0.5) return { expr: `\\frac{${a}}{${d1}}+\\frac{${b}}{${d2}}=`, ans: fracStr(na + nb, L) };
    if (na === nb) return null;
    const expr = na > nb ? `\\frac{${a}}{${d1}}-\\frac{${b}}{${d2}}=` : `\\frac{${b}}{${d2}}-\\frac{${a}}{${d1}}=`;
    return { expr, ans: fracStr(Math.abs(na - nb), L) };
  });
}
function genFracMul(rng, count) { return uniqueProbs(rng, count, () => { const b = ri(rng, 2, 7), d = ri(rng, 2, 7), a = ri(rng, 1, b - 1), c = ri(rng, 1, d - 1); return { expr: `\\frac{${a}}{${b}}\\times\\frac{${c}}{${d}}=`, ans: fracStr(a * c, b * d) }; }); }
function genFracDiv(rng, count) { return uniqueProbs(rng, count, () => { const b = ri(rng, 2, 7), d = ri(rng, 2, 7), a = ri(rng, 1, b - 1), c = ri(rng, 1, d - 1); return { expr: `\\frac{${a}}{${b}}\\div\\frac{${c}}{${d}}=`, ans: fracStr(a * d, b * c) }; }); }
function genFracMulInt(rng, count) { return uniqueProbs(rng, count, () => { const b = ri(rng, 2, 8), a = ri(rng, 1, b - 1), k = ri(rng, 2, 6); return { expr: `\\frac{${a}}{${b}}\\times${k}=`, ans: fracStr(a * k, b) }; }); }
function genFracDivInt(rng, count) { return uniqueProbs(rng, count, () => { const b = ri(rng, 2, 8), a = ri(rng, 1, b - 1), k = ri(rng, 2, 6); return { expr: `\\frac{${a}}{${b}}\\div${k}=`, ans: fracStr(a, b * k) }; }); }

// =============================================================================
// プリント一覧 (小学4年)
// =============================================================================
function buildG4() {
  const P = [];
  const add = (d) => P.push(d);
  const G = 4;

  add({ grade: G, subject: "算数", id: "g4-01", unitNo: 1, name: "算数4年① 大きい数", title: "大きい数", subtitle: "億・兆", goal: "億や 兆の 大きい数を よめるように なろう！", desc: "億・兆。整数の仕組み、大きな数のかけ算・わり算。",
    body: iplusBody([
      { q: "1000万を 10こ あつめた数は いくつですか。", a: "1億" },
      { q: "1億を 1000こ あつめた数は いくつですか。", a: "1000億" },
      { q: "$50000\\times100$ を 計算しましょう。", a: "5000000" },
      { q: "$8000000\\div1000$ を 計算しましょう。", a: "8000" },
      { q: "1兆は 1億の 何倍ですか。", a: "10000 倍" },
      { q: "3億5000万を 数字で かきましょう。", a: "350000000" },
      { q: "1000万を 100こ あつめた数は いくつですか。", a: "10億" },
      { q: "7億2000万を 数字で かきましょう。", a: "720000000" },
      { q: "$40000\\times1000$ を 計算しましょう。", a: "40000000" },
      { q: "$3000000\\div100$ を 計算しましょう。", a: "30000" },
    ], { section: "大きい数に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g4-02", unitNo: 2, name: "算数4年② 折れ線グラフ", title: "折れ線グラフ", subtitle: "へんかを よみとる", goal: "折れ線グラフから かわりかたを よみとろう！", desc: "折れ線グラフの読み方・かき方。",
    body: iplusBody([
      { q: "いちばん 気温が 高いのは 何時ですか。", a: "12時" },
      { q: "いちばん 気温が ひくいのは 何時ですか。", a: "9時" },
      { q: "10時の 気温は 何℃ですか。", a: "17 ℃" },
      { q: "9時から 12時までに 気温は 何℃ 上がりましたか。", a: "8 ℃" },
      { q: "11時から 12時までに 気温は 何℃ 上がりましたか。", a: "2 ℃" },
      { q: "気温が 下がったのは 何時から 何時の あいだですか。", a: "12時〜13時" },
    ], { section: "折れ線グラフを よんで こたえましょう", intro: "{\\large ある日の 気温(℃)}\\par\\vspace{1mm}\\begin{kpgraph}{6}{5}\\kpgx{1}{9時}\\kpgx{2}{10時}\\kpgx{3}{11時}\\kpgx{4}{12時}\\kpgx{5}{13時}\\kpgy{1}{5}\\kpgy{2}{10}\\kpgy{3}{15}\\kpgy{4}{20}\\kpgy{5}{25}\\kpgline{(1,2.8) (2,3.4) (3,4) (4,4.4) (5,4.2)}\\end{kpgraph}" }) });

  add(calcPrint({ grade: G, id: "g4-03", unitNo: 3, name: "算数4年③ 1けたで わるわり算", title: "1けたで わるわり算", subtitle: "わり算の ひっ算", goal: "大きい数を 1けたで わる ひっ算が できるように なろう！", desc: "(2,3位数)÷(1位数)の筆算。" }, (rng) => genDivLong(rng, 36, { dividendMax: 999, divisorMax: 9 })));

  add(calcPrint({ grade: G, id: "g4-04", unitNo: 4, name: "算数4年④ 2けたで わるわり算", title: "2けたで わるわり算", subtitle: "わり算の ひっ算", goal: "2けたで わる わり算が できるように なろう！", desc: "(2,3位数)÷(2位数)の筆算。" }, (rng) => genDiv2(rng, 18), 2));

  add({ grade: G, subject: "算数", id: "g4-05", unitNo: 5, name: "算数4年⑤ がい数 (四捨五入)", title: "がい数", subtitle: "四捨五入", goal: "四捨五入して、およその 数で あらわそう！", desc: "概数、四捨五入、概算。",
    body: iplusBody([
      { q: "2834 を 四捨五入して 百のくらいまでの がい数に しましょう。", a: "2800" },
      { q: "4567 を 四捨五入して 千のくらいまでの がい数に しましょう。", a: "5000" },
      { q: "31250 を 四捨五入して 一万のくらいまでの がい数に しましょう。", a: "30000" },
      { q: "785 を 四捨五入して 十のくらいまでの がい数に しましょう。", a: "790" },
      { q: "6480 を 四捨五入して 百のくらいまでの がい数に しましょう。", a: "6500" },
      { q: "7321 を 四捨五入して 百のくらいまでの がい数に しましょう。", a: "7300" },
      { q: "850 を 四捨五入して 百のくらいまでの がい数に しましょう。", a: "900" },
      { q: "12345 を 四捨五入して 千のくらいまでの がい数に しましょう。", a: "12000" },
      { q: "28500 を 四捨五入して 千のくらいまでの がい数に しましょう。", a: "29000" },
      { q: "962 を 四捨五入して 十のくらいまでの がい数に しましょう。", a: "960" },
    ], { section: "四捨五入して がい数に しましょう" }) });

  add({ grade: G, subject: "算数", id: "g4-06", unitNo: 6, name: "算数4年⑥ 角", title: "角の 大きさ", subtitle: "角度", goal: "角の 大きさ(角度)を かんがえよう！", desc: "回転角、角の単位(度)。1直角=90度。",
    body: iplusBody([
      { q: "1直角は 何度ですか。", a: "90 度" },
      { q: "2直角(まっすぐ)は 何度ですか。", a: "180 度" },
      { q: "1回転は 何度ですか。", a: "360 度" },
      { q: "三角じょうぎの いちばん 大きい角は 何度ですか。", a: "90 度" },
      { q: "3直角は 何度ですか。", a: "270 度" },
      { q: "直角の 半分の 角は 何度ですか。", a: "45 度" },
      { q: "60度と 30度を あわせると 何度ですか。", a: "90 度" },
      { q: "120度は 1直角より 何度 大きいですか。", a: "30 度" },
      { q: "180度から 50度を ひくと 何度ですか。", a: "130 度" },
      { q: "1回転の 半分は 何度ですか。", a: "180 度" },
    ], { section: "角の 大きさ(角度)を こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g4-07", unitNo: 7, name: "算数4年⑦ 垂直・平行と 四角形", title: "垂直・平行と 四角形", subtitle: "いろいろな 四角形", goal: "垂直・平行と、いろいろな 四角形を しらべよう！", desc: "垂直・平行の意味、台形・平行四辺形・ひし形。",
    body: iplusBody([
      { q: "むかいあった 2くみの 辺が 平行な 四角形を 何と いいますか。", a: "平行四辺形" },
      { q: "4つの 辺の 長さが みんな 同じ 四角形を 何と いいますか。", a: "ひし形" },
      { q: "1くみの 辺だけが 平行な 四角形を 何と いいますか。", a: "台形" },
      { q: "4つの 角が みんな 直角の 四角形を 何と いいますか。", a: "長方形" },
      { q: "4つの 辺が 同じで 4つの 角が 直角の 四角形を 何と いいますか。", a: "正方形" },
      { q: "平行四辺形の むかいあう 辺の 長さは どうなって いますか。", a: "等しい" },
      { q: "平行四辺形の むかいあう 角の 大きさは どうなって いますか。", a: "等しい" },
      { q: "台形で 平行な 辺は 何くみ ありますか。", a: "1 くみ" },
    ], { section: "四角形の なまえを こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g4-08", unitNo: 8, name: "算数4年⑧ 小数", title: "小数の しくみ", subtitle: "小数第二・三位", goal: "0.01 や 0.001 の くらいの 小数を かんがえよう！", desc: "小数第二位・三位、小数の仕組み。",
    body: iplusBody([
      { q: "0.01 を 7こ あつめた数は いくつですか。", a: "0.07" },
      { q: "0.1 を 23こ あつめた数は いくつですか。", a: "2.3" },
      { q: "$3.14\\times10$ を 計算しましょう。", a: "31.4" },
      { q: "$5.6\\div10$ を 計算しましょう。", a: "0.56" },
      { q: "0.001 を 5こ あつめた数は いくつですか。", a: "0.005" },
      { q: "0.01 を 30こ あつめた数は いくつですか。", a: "0.3" },
      { q: "2.5 は 0.1 を 何こ あつめた数ですか。", a: "25 こ" },
      { q: "$4.07\\times100$ を 計算しましょう。", a: "407" },
      { q: "$0.8\\div100$ を 計算しましょう。", a: "0.008" },
      { q: "0.1 を 100こ あつめた数は いくつですか。", a: "10" },
    ], { section: "小数の しくみに ついて こたえましょう" }) });

  add(calcPrint({ grade: G, id: "g4-09", unitNo: 9, name: "算数4年⑨ 小数の たし算・ひき算", title: "小数の たし算・ひき算", subtitle: "小数の ひっ算", goal: "小数の たし算・ひき算を ひっ算で できるように なろう！", desc: "小数(第一位)の加減の筆算。" }, (rng) => genDecimal(rng, 36)));

  add(calcPrint({ grade: G, id: "g4-10", unitNo: 10, name: "算数4年⑩ 小数の かけ算 (×整数)", title: "小数の かけ算", subtitle: "小数 × 整数", goal: "(小数)×(整数)が できるように なろう！", desc: "(小数)×(整数)の計算、筆算。" }, (rng) => genDecMulInt(rng, 36)));

  add(calcPrint({ grade: G, id: "g4-11", unitNo: 11, name: "算数4年⑪ 小数の わり算 (÷整数)", title: "小数の わり算", subtitle: "小数 ÷ 整数", goal: "(小数)÷(整数)が できるように なろう！", desc: "(小数)÷(整数)の計算、筆算。" }, (rng) => genDecDivInt(rng, 36)));

  add({ grade: G, subject: "算数", id: "g4-12", unitNo: 12, name: "算数4年⑫ 式と計算", title: "式と 計算", subtitle: "( )・四則の じゅんじょ", goal: "( )や かけ算・わり算を 先に 計算しよう！", desc: "四則の混じった式、計算の順序、( )。",
    body: calcBody([{ expr: "3+4\\times2=", ans: 11 }, { expr: "(3+4)\\times2=", ans: 14 }, { expr: "20-12\\div4=", ans: 17 }, { expr: "(20-12)\\div4=", ans: 2 }, { expr: "8\\times(5-2)=", ans: 24 }, { expr: "6+18\\div3=", ans: 12 }, { expr: "36\\div(4+2)=", ans: 6 }, { expr: "5\\times4-12\\div3=", ans: 16 }, { expr: "(15-7)\\times(2+3)=", ans: 40 }, { expr: "48\\div6+7\\times2=", ans: 22 }], "計算の じゅんじょ(( )・$\\times\\div$ が さき)に 気を つけて 計算しましょう") });

  add({ grade: G, subject: "算数", id: "g4-13", unitNo: 13, name: "算数4年⑬ 面積", title: "面積", subtitle: "長方形・正方形", goal: "長方形・正方形の 面積を もとめよう！", desc: "面積の意味と単位、長方形・正方形の面積公式。",
    body: iplusBody([
      { q: "たて 4cm、よこ 6cm の 長方形の 面積を もとめましょう。($4\\times6$)", a: "24 cm$^2$" },
      { q: "1辺 5cm の 正方形の 面積を もとめましょう。($5\\times5$)", a: "25 cm$^2$" },
      { q: "たて 8m、よこ 10m の 長方形の 面積を もとめましょう。", a: "80 m$^2$" },
      { q: "$1$ m$^2$ は 何 cm$^2$ ですか。", a: "10000 cm$^2$" },
      { q: "たて 7cm、よこ 9cm の 長方形の 面積を もとめましょう。", a: "63 cm$^2$" },
      { q: "1辺 8cm の 正方形の 面積を もとめましょう。", a: "64 cm$^2$" },
      { q: "たて 5m、よこ 12m の 長方形の 面積を もとめましょう。", a: "60 m$^2$" },
      { q: "1辺 10cm の 正方形の 面積を もとめましょう。", a: "100 cm$^2$" },
      { q: "面積 60cm$^2$、たて 6cm の 長方形の よこの 長さは 何 cm ですか。", a: "10 cm" },
      { q: "1 km$^2$ は 何 m$^2$ ですか。", a: "1000000 m$^2$" },
    ], { section: "面積を もとめましょう" }) });

  add({ grade: G, subject: "算数", id: "g4-14", unitNo: 14, name: "算数4年⑭ 分数", title: "分数", subtitle: "仮分数・帯分数", goal: "仮分数と 帯分数を なおせるように なろう！", desc: "真分数・仮分数・帯分数、同分母分数の加減。",
    body: iplusBody([
      { q: "$\\frac{7}{3}$ を 帯分数に なおしましょう。", a: "$2\\frac{1}{3}$" },
      { q: "$1\\frac{2}{5}$ を 仮分数に なおしましょう。", a: "$\\frac{7}{5}$" },
      { q: "$\\frac{2}{6}$ を かんたんに しましょう。", a: "$\\frac{1}{3}$" },
      { q: "$\\frac{4}{5}+\\frac{3}{5}$ を 計算しましょう。", a: "$\\frac{7}{5}$" },
      { q: "$\\frac{11}{4}$ を 帯分数に なおしましょう。", a: "$2\\frac{3}{4}$" },
      { q: "$2\\frac{2}{5}$ を 仮分数に なおしましょう。", a: "$\\frac{12}{5}$" },
      { q: "$\\frac{9}{6}$ を かんたんに しましょう。", a: "$\\frac{3}{2}$" },
      { q: "$\\frac{3}{7}+\\frac{2}{7}$ を 計算しましょう。", a: "$\\frac{5}{7}$" },
      { q: "$1-\\frac{2}{5}$ を 計算しましょう。", a: "$\\frac{3}{5}$" },
      { q: "$\\frac{4}{3}+\\frac{5}{3}$ を 計算しましょう。", a: "3" },
    ], { section: "分数に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g4-15", unitNo: 15, name: "算数4年⑮ 直方体と 立方体", title: "直方体と 立方体", subtitle: "面・辺・頂点", goal: "直方体・立方体の 面・辺・頂点を しらべよう！", desc: "直方体・立方体の定義と性質、見取図・展開図。",
    body: iplusBody([
      { q: "面は いくつ ありますか。", a: "6 つ" },
      { q: "辺は いくつ ありますか。", a: "12 つ" },
      { q: "頂点は いくつ ありますか。", a: "8 つ" },
      { q: "立方体の 面の 形は 何ですか。", a: "正方形" },
      { q: "むかいあう 面は 何くみ ありますか。", a: "3 くみ" },
      { q: "1つの 頂点に 集まる 辺は 何本ですか。", a: "3 本" },
      { q: "立方体の 辺の 長さは どうなって いますか。", a: "みんな 同じ" },
    ], { section: "立方体に ついて こたえましょう", intro: "\\begin{center}\\begin{tikzpicture}[scale=0.9]\\kpcube{0}{0}\\end{tikzpicture}\\end{center}" }) });

  add({ grade: G, subject: "算数", id: "g4-16", unitNo: 16, name: "算数4年⑯ ともなって 変わる量", title: "ともなって 変わる量", subtitle: "□と○の かんけい", goal: "2つの 量の かわりかたを 式に あらわそう！", desc: "伴って変わる2つの量、□や○を使った式。",
    body: iplusBody([
      { q: "□と ○の かんけいを 式に あらわすと、○ $=$ □ $\\times$ □ の □に 入る数は いくつですか。", a: "4" },
      { q: "□が 7 の とき、○は いくつですか。", a: "28" },
      { q: "○が 40 の とき、□は いくつですか。", a: "10" },
      { q: "□が 5 の とき、○は いくつですか。", a: "20" },
      { q: "○が 24 の とき、□は いくつですか。", a: "6" },
      { q: "○は □の 何倍ですか。", a: "4 倍" },
    ], { section: "ともなって 変わる量に ついて こたえましょう", intro: "{\\large 1辺が □cm の 正方形の まわりの 長さを ○cm と すると、\\par □が 1, 2, 3, 4 の とき ○は 4, 8, 12, 16}" }) });

  add(calcPrint({ grade: G, id: "g4-17", unitNo: 17, name: "算数4年⑰ 計算の れんしゅう", title: "計算の れんしゅう", subtitle: "わり算・小数 ミックス", goal: "わり算と 小数の 計算を すらすら できるように なろう！", desc: "除法・小数計算の習熟。" }, (rng) => [...genDivLong(rng, 14, { dividendMax: 999 }), ...genDecMulInt(rng, 11), ...genDecDivInt(rng, 11)], 3));

  add(calcPrint({ grade: G, id: "g4-18", unitNo: 18, name: "算数4年⑱ 4年の まとめ", title: "4年の まとめ", subtitle: "わり算・小数・分数", goal: "4年で ならった 計算の しあげ！", desc: "4年の計算の総合復習。" }, (rng) => [...genDiv2(rng, 5), ...genDecMulInt(rng, 7), ...genDecDivInt(rng, 7), ...genDecimal(rng, 9)], 3));

  return P;
}


// =============================================================================
// プリント一覧 (小学5年)
// =============================================================================
function buildG5() {
  const P = [];
  const add = (d) => P.push(d);
  const G = 5;

  add({ grade: G, subject: "算数", id: "g5-01", unitNo: 1, name: "算数5年① 小数と整数", title: "小数と 整数", subtitle: "10倍・1/10", goal: "小数を 10倍・$\\frac{1}{10}$ したときの しくみを かんがえよう！", desc: "十進位取り記数法、小数を10倍・1/10した数。",
    body: iplusBody([
      { q: "$2.74\\times10$ を 計算しましょう。", a: "27.4" },
      { q: "$2.74\\times100$ を 計算しましょう。", a: "274" },
      { q: "$36\\div10$ を 計算しましょう。", a: "3.6" },
      { q: "$5\\div100$ を 計算しましょう。", a: "0.05" },
      { q: "$0.38\\times10$ を 計算しましょう。", a: "3.8" },
      { q: "$0.38\\times100$ を 計算しましょう。", a: "38" },
      { q: "$4.5\\times1000$ を 計算しましょう。", a: "4500" },
      { q: "$7\\div10$ を 計算しましょう。", a: "0.7" },
      { q: "$250\\div100$ を 計算しましょう。", a: "2.5" },
      { q: "$0.06\\times10$ を 計算しましょう。", a: "0.6" },
    ], { section: "10倍・$\\frac{1}{10}$ の しくみで 計算しましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-02", unitNo: 2, name: "算数5年② 合同な図形", title: "合同な 図形", subtitle: "対応する 辺・角", goal: "ぴったり 重なる 図形の 対応を しらべよう！", desc: "合同の意味、対応する頂点・辺・角。",
    body: iplusBody([
      { q: "辺DE の 長さは 何 cm ですか。", a: "5 cm" },
      { q: "角E の 大きさは 何度ですか。", a: "40 度" },
      { q: "合同な 図形で ぴったり 重なる 頂点を 何と いいますか。", a: "対応する 頂点" },
      { q: "合同な 図形の 対応する 辺の 長さは どうなって いますか。", a: "等しい" },
      { q: "合同な 図形の 対応する 角の 大きさは どうなって いますか。", a: "等しい" },
      { q: "辺AB に 対応する 辺は どれですか。", a: "辺DE" },
    ], { section: "合同な 図形に ついて こたえましょう", intro: "{\\large 三角形ABC と 三角形DEF が 合同で、AB$=$5cm、角B$=$40度です。}" }) });

  add({ grade: G, subject: "算数", id: "g5-03", unitNo: 3, name: "算数5年③ 比例", title: "比例", subtitle: "ともなって 変わる量", goal: "一方が 2倍、3倍に なると もう一方も…の かんけいを しらべよう！", desc: "比例の関係、表に表す。",
    body: iplusBody([
      { q: "○は □に 比例しています。○ $=$ □ $\\times$ □ の さいしょの □に 入る きまった数は いくつですか。", a: "80" },
      { q: "長さが 6m の とき、代金は 何円ですか。", a: "480 円" },
      { q: "代金が 800円の とき、長さは 何 m ですか。", a: "10 m" },
      { q: "長さが 2倍に なると、代金は 何倍に なりますか。", a: "2 倍" },
      { q: "長さが 5m の とき、代金は 何円ですか。", a: "400 円" },
      { q: "代金が 640円の とき、長さは 何 m ですか。", a: "8 m" },
    ], { section: "比例の かんけいに ついて こたえましょう", intro: "{\\large 1mの ねだんが 80円の リボン\\quad 長さ □m … 1, 2, 3, 4 ／ 代金 ○円 … 80, 160, 240, 320}" }) });

  add({ grade: G, subject: "算数", id: "g5-04", unitNo: 4, name: "算数5年④ 平均", title: "平均", subtitle: "ならすと いくつ", goal: "いくつかの 数を ならした 平均を もとめよう！", desc: "平均の意味と求め方。",
    body: iplusBody([
      { q: "3, 5, 4 の 平均を もとめましょう。($(3+5+4)\\div3$)", a: "4" },
      { q: "10, 8, 6, 12 の 平均を もとめましょう。", a: "9" },
      { q: "テスト 80点, 90点, 70点 の 平均を もとめましょう。", a: "80 点" },
      { q: "6, 4, 8, 2 の 平均を もとめましょう。", a: "5" },
      { q: "12, 15, 9 の 平均を もとめましょう。", a: "12" },
      { q: "5回の テストの 合計が 400点の とき、平均は 何点ですか。", a: "80 点" },
      { q: "平均が 6 で 3こ あるとき、合計は いくつですか。", a: "18" },
      { q: "20, 30, 40, 50 の 平均を もとめましょう。", a: "35" },
      { q: "1, 2, 3, 4, 5 の 平均を もとめましょう。", a: "3" },
    ], { section: "平均を もとめましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-05", unitNo: 5, name: "算数5年⑤ 単位量あたりの 大きさ", title: "単位量あたりの 大きさ", subtitle: "こみぐあい", goal: "1あたりの 大きさで くらべよう！", desc: "単位量あたりの大きさ、混み具合・人口密度。",
    body: iplusBody([
      { q: "8m$^2$ に 24人 いる へやの 1m$^2$ あたりの 人数を もとめましょう。($24\\div8$)", a: "3 人" },
      { q: "5L で 300km 走る車の 1L あたりの きょりを もとめましょう。($300\\div5$)", a: "60 km" },
      { q: "A室は 6畳に 9人、B室は 8畳に 10人 います。こんでいるのは どちらですか。", a: "A室" },
      { q: "12m$^2$ に 36人 いる へやの 1m$^2$ あたりの 人数を もとめましょう。", a: "3 人" },
      { q: "4L で 200km 走る車の 1L あたりの きょりを もとめましょう。", a: "50 km" },
      { q: "1km$^2$ あたり 500人 で 5km$^2$ の 町の 人口は 何人ですか。", a: "2500 人" },
      { q: "300円で 6こ 買える えんぴつ 1本の ねだんは 何円ですか。", a: "50 円" },
      { q: "15m$^2$ に 45人 いる へやの 1m$^2$ あたりの 人数を もとめましょう。", a: "3 人" },
    ], { section: "単位量あたりの 大きさで くらべましょう" }) });

  add(calcPrint({ grade: G, id: "g5-06", unitNo: 6, name: "算数5年⑥ 小数の かけ算", title: "小数の かけ算", subtitle: "小数 × 小数", goal: "(小数)×(小数)が できるように なろう！", desc: "(小数)×(小数)の意味と計算、筆算。" }, (rng) => genDecMulDec(rng, 36), 2));

  add(calcPrint({ grade: G, id: "g5-07", unitNo: 7, name: "算数5年⑦ 小数の わり算", title: "小数の わり算", subtitle: "小数 ÷ 小数", goal: "(小数)÷(小数)が できるように なろう！", desc: "(小数)÷(小数)の意味と計算、筆算。" }, (rng) => genDecDivDec(rng, 36)));

  add({ grade: G, subject: "算数", id: "g5-08", unitNo: 8, name: "算数5年⑧ 速さ", title: "速さ", subtitle: "速さ・道のり・時間", goal: "速さ $=$ 道のり $÷$ 時間。 速さの もとめ方を おぼえよう！", desc: "速さの意味と求め方(時速・分速・秒速)。",
    body: iplusBody([
      { q: "120km を 3時間で 走る車の 時速を もとめましょう。($120\\div3$)", a: "時速 40 km" },
      { q: "時速 60km で 2時間 走ると、道のりは 何 km ですか。($60\\times2$)", a: "120 km" },
      { q: "240km を 時速 80km で 走ると、かかる時間は 何時間ですか。($240\\div80$)", a: "3 時間" },
      { q: "100m を 20秒で 走る人の 秒速を もとめましょう。", a: "秒速 5 m" },
      { q: "分速 80m で 5分 歩くと、道のりは 何 m ですか。", a: "400 m" },
      { q: "360km を 時速 90km で 走ると、かかる時間は 何時間ですか。", a: "4 時間" },
      { q: "150km を 2時間で 走る車の 時速を もとめましょう。", a: "時速 75 km" },
      { q: "時速 50km で 3時間 走ると、道のりは 何 km ですか。", a: "150 km" },
    ], { section: "速さ・道のり・時間を もとめましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-09", unitNo: 9, name: "算数5年⑨ 図形の 角", title: "図形の 角", subtitle: "内角の 和", goal: "三角形や 四角形の 角の 大きさの 和を しらべよう！", desc: "三角形・多角形の内角の和。",
    body: iplusBody([
      { q: "三角形の 3つの 角の 大きさの 和は 何度ですか。", a: "180 度" },
      { q: "四角形の 4つの 角の 大きさの 和は 何度ですか。", a: "360 度" },
      { q: "2つの 角が 50度、60度 の 三角形の のこりの 角は 何度ですか。", a: "70 度" },
      { q: "五角形の 角の 大きさの 和は 何度ですか。", a: "540 度" },
      { q: "六角形の 角の 大きさの 和は 何度ですか。", a: "720 度" },
      { q: "七角形の 角の 大きさの 和は 何度ですか。", a: "900 度" },
      { q: "2つの 角が 90度、40度 の 三角形の のこりの 角は 何度ですか。", a: "50 度" },
      { q: "正三角形の 1つの 角は 何度ですか。", a: "60 度" },
      { q: "三角形で 1つの 角が 直角、もう1つが 30度の とき、のこりの 角は 何度ですか。", a: "60 度" },
      { q: "正方形の 1つの 角は 何度ですか。", a: "90 度" },
    ], { section: "図形の 角に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-10", unitNo: 10, name: "算数5年⑩ 倍数と 約数", title: "倍数と 約数", subtitle: "公倍数・公約数", goal: "最小公倍数・最大公約数を もとめよう！", desc: "倍数・公倍数・最小公倍数、約数・公約数・最大公約数。",
    body: iplusBody([
      { q: "6と 8の 最小公倍数を もとめましょう。", a: "24" },
      { q: "12と 18の 最大公約数を もとめましょう。", a: "6" },
      { q: "4と 6の 最小公倍数を もとめましょう。", a: "12" },
      { q: "16の 約数を すべて かきましょう。(1, 2, 4, 8, …)", a: "1, 2, 4, 8, 16" },
      { q: "3と 5の 最小公倍数を もとめましょう。", a: "15" },
      { q: "9と 12の 最小公倍数を もとめましょう。", a: "36" },
      { q: "8と 12の 最大公約数を もとめましょう。", a: "4" },
      { q: "15と 20の 最大公約数を もとめましょう。", a: "5" },
      { q: "12の 約数を すべて かきましょう。", a: "1, 2, 3, 4, 6, 12" },
      { q: "7の 倍数を 小さい順に 3つ かきましょう。", a: "7, 14, 21" },
    ], { section: "倍数と 約数に ついて こたえましょう" }) });

  add(calcPrint({ grade: G, id: "g5-11", unitNo: 11, name: "算数5年⑪ 分数の たし算・ひき算", title: "分数の たし算・ひき算", subtitle: "通分して 計算", goal: "分母の ちがう 分数を 通分して 計算しよう！", desc: "異分母分数の加減、通分・約分。" }, (rng) => genFracDiff(rng, 30), 2));

  add({ grade: G, subject: "算数", id: "g5-12", unitNo: 12, name: "算数5年⑫ 分数と 小数", title: "分数と 小数", subtitle: "なおして くらべる", goal: "分数を 小数に、小数を 分数に なおそう！", desc: "分数と小数・整数の関係。",
    body: iplusBody([
      { q: "$\\frac{1}{2}$ を 小数で あらわしましょう。", a: "0.5" },
      { q: "$\\frac{3}{4}$ を 小数で あらわしましょう。", a: "0.75" },
      { q: "$0.7$ を 分数で あらわしましょう。", a: "$\\frac{7}{10}$" },
      { q: "$3\\div4$ の 商を 分数で あらわしましょう。", a: "$\\frac{3}{4}$" },
      { q: "$\\frac{1}{4}$ を 小数で あらわしましょう。", a: "0.25" },
      { q: "$\\frac{1}{5}$ を 小数で あらわしましょう。", a: "0.2" },
      { q: "$0.3$ を 分数で あらわしましょう。", a: "$\\frac{3}{10}$" },
      { q: "$0.25$ を 分数で あらわしましょう。", a: "$\\frac{1}{4}$" },
      { q: "$1\\div8$ の 商を 分数で あらわしましょう。", a: "$\\frac{1}{8}$" },
      { q: "$\\frac{7}{10}$ を 小数で あらわしましょう。", a: "0.7" },
    ], { section: "分数と 小数を なおしましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-13", unitNo: 13, name: "算数5年⑬ 割合", title: "割合", subtitle: "割合・百分率", goal: "割合 $=$ くらべる量 $÷$ もとにする量。 百分率も おぼえよう！", desc: "割合の意味と求め方、百分率・歩合。",
    body: iplusBody([
      { q: "20人の うち 5人の 割合を もとめましょう。($5\\div20$)", a: "0.25" },
      { q: "$0.25$ を 百分率で あらわしましょう。", a: "25 ％" },
      { q: "200円の 30％は 何円ですか。($200\\times0.3$)", a: "60 円" },
      { q: "$0.4$ を 歩合で あらわしましょう。", a: "4 わり" },
      { q: "50人の うち 20人の 割合を もとめましょう。", a: "0.4" },
      { q: "$0.6$ を 百分率で あらわしましょう。", a: "60 ％" },
      { q: "80％ を 小数で あらわしましょう。", a: "0.8" },
      { q: "500円の 20％は 何円ですか。", a: "100 円" },
      { q: "30人の 40％は 何人ですか。", a: "12 人" },
      { q: "3わり を 小数で あらわしましょう。", a: "0.3" },
    ], { section: "割合・百分率に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-14", unitNo: 14, name: "算数5年⑭ 図形の 面積", title: "図形の 面積", subtitle: "三角形・平行四辺形・台形", goal: "三角形・平行四辺形・台形の 面積を もとめよう！", desc: "三角形・平行四辺形・台形・ひし形の面積公式。",
    body: iplusBody([
      { q: "底辺 6cm、高さ 4cm の 三角形の 面積を もとめましょう。($6\\times4\\div2$)", a: "12 cm$^2$" },
      { q: "底辺 5cm、高さ 8cm の 平行四辺形の 面積を もとめましょう。($5\\times8$)", a: "40 cm$^2$" },
      { q: "上底 3cm、下底 7cm、高さ 4cm の 台形の 面積を もとめましょう。($(3+7)\\times4\\div2$)", a: "20 cm$^2$" },
      { q: "底辺 8cm、高さ 5cm の 三角形の 面積を もとめましょう。", a: "20 cm$^2$" },
      { q: "底辺 10cm、高さ 6cm の 平行四辺形の 面積を もとめましょう。", a: "60 cm$^2$" },
      { q: "上底 4cm、下底 8cm、高さ 5cm の 台形の 面積を もとめましょう。", a: "30 cm$^2$" },
      { q: "底辺 12cm、高さ 7cm の 三角形の 面積を もとめましょう。", a: "42 cm$^2$" },
      { q: "2本の 対角線が 6cm と 8cm の ひし形の 面積を もとめましょう。", a: "24 cm$^2$" },
      { q: "底辺 9cm、高さ 4cm の 平行四辺形の 面積を もとめましょう。", a: "36 cm$^2$" },
    ], { section: "図形の 面積を もとめましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-15", unitNo: 15, name: "算数5年⑮ 正多角形と 円", title: "正多角形と 円", subtitle: "円周 $=$ 直径 × 3.14", goal: "円周の もとめ方を おぼえよう！", desc: "正多角形、円周率、円周の求め方。",
    body: iplusBody([
      { q: "直径 10cm の 円の 円周を もとめましょう。($10\\times3.14$)", a: "31.4 cm" },
      { q: "直径 8cm の 円の 円周を もとめましょう。($8\\times3.14$)", a: "25.12 cm" },
      { q: "半径 5cm の 円の 円周を もとめましょう。($10\\times3.14$)", a: "31.4 cm" },
      { q: "正六角形の 辺(角)の 数は いくつですか。", a: "6" },
      { q: "直径 6cm の 円の 円周を もとめましょう。", a: "18.84 cm" },
      { q: "直径 20cm の 円の 円周を もとめましょう。", a: "62.8 cm" },
      { q: "半径 3cm の 円の 円周を もとめましょう。", a: "18.84 cm" },
      { q: "半径 10cm の 円の 円周を もとめましょう。", a: "62.8 cm" },
      { q: "直径 100cm の 円の 円周を もとめましょう。", a: "314 cm" },
      { q: "正八角形の 辺の 数は いくつですか。", a: "8" },
    ], { section: "円周を もとめましょう(円周率は 3.14)" }) });

  add({ grade: G, subject: "算数", id: "g5-16", unitNo: 16, name: "算数5年⑯ 体積", title: "体積", subtitle: "直方体・立方体", goal: "直方体・立方体の 体積を もとめよう！", desc: "体積の意味と単位、直方体・立方体の体積公式。",
    body: iplusBody([
      { q: "たて 3cm、よこ 4cm、高さ 5cm の 直方体の 体積を もとめましょう。($3\\times4\\times5$)", a: "60 cm$^3$" },
      { q: "1辺 4cm の 立方体の 体積を もとめましょう。($4\\times4\\times4$)", a: "64 cm$^3$" },
      { q: "$1$ L は 何 cm$^3$ ですか。", a: "1000 cm$^3$" },
      { q: "たて 5cm、よこ 6cm、高さ 2cm の 直方体の 体積を もとめましょう。", a: "60 cm$^3$" },
      { q: "1辺 3cm の 立方体の 体積を もとめましょう。", a: "27 cm$^3$" },
      { q: "たて 10cm、よこ 10cm、高さ 10cm の 直方体の 体積を もとめましょう。", a: "1000 cm$^3$" },
      { q: "$1$ m$^3$ は 何 cm$^3$ ですか。", a: "1000000 cm$^3$" },
      { q: "たて 2cm、よこ 8cm、高さ 5cm の 直方体の 体積を もとめましょう。", a: "80 cm$^3$" },
      { q: "1辺 5cm の 立方体の 体積を もとめましょう。", a: "125 cm$^3$" },
    ], { section: "体積を もとめましょう" }) });

  add({ grade: G, subject: "算数", id: "g5-17", unitNo: 17, name: "算数5年⑰ 割合と グラフ", title: "割合と グラフ", subtitle: "百分率・円グラフ", goal: "割合を つかって、円グラフや 帯グラフを よもう！", desc: "割合(2)、円グラフ・帯グラフ。",
    body: iplusBody([
      { q: "算数が すきな 人の 割合を 小数で もとめ、百分率でも あらわしましょう。($16\\div40$)", a: "0.4（40 ％）" },
      { q: "国語が すきな 人の 百分率を もとめましょう。", a: "25 ％" },
      { q: "理科が すきな 人の 百分率を もとめましょう。", a: "20 ％" },
      { q: "社会が すきな 人の 百分率を もとめましょう。", a: "15 ％" },
      { q: "算数と 国語を あわせた 百分率を もとめましょう。", a: "65 ％" },
      { q: "算数が すきな 人の 割合を 分数で あらわしましょう。", a: "$\\frac{2}{5}$" },
      { q: "いちばん 人数が 少ない 教科は どれですか。", a: "社会" },
    ], { section: "割合と グラフに ついて こたえましょう", intro: "{\\large 40人の すきな 教科 しらべ\\quad 算数 16人 ／ 国語 10人 ／ 理科 8人 ／ 社会 6人}" }) });

  add(calcPrint({ grade: G, id: "g5-18", unitNo: 18, name: "算数5年⑱ 5年の まとめ", title: "5年の まとめ", subtitle: "小数・分数の 計算", goal: "5年で ならった 計算の しあげ！", desc: "5年の計算の総合復習。" }, (rng) => [...genDecMulDec(rng, 9), ...genDecDivDec(rng, 9), ...genFracDiff(rng, 11)], 2));

  return P;
}


// =============================================================================
// プリント一覧 (小学6年)
// =============================================================================
function buildG6() {
  const P = [];
  const add = (d) => P.push(d);
  const G = 6;

  add({ grade: G, subject: "算数", id: "g6-01", unitNo: 1, name: "算数6年① 文字と式", title: "文字と 式", subtitle: "x を つかった 式", goal: "x を つかった 式に 数を あてはめて もとめよう！", desc: "文字x,aを使った式、式の値を求める。",
    body: iplusBody([
      { q: "$x+5$ で $x=8$ の とき、式の 値を もとめましょう。", a: "13" },
      { q: "$x\\times3$ で $x=4$ の とき、式の 値を もとめましょう。", a: "12" },
      { q: "$x\\times4=20$ の とき、$x$ の 値を もとめましょう。", a: "5" },
      { q: "$80\\times x$ で $x=6$ の とき、式の 値を もとめましょう。", a: "480" },
      { q: "$x+7$ で $x=9$ の とき、式の 値を もとめましょう。", a: "16" },
      { q: "$x-4$ で $x=10$ の とき、式の 値を もとめましょう。", a: "6" },
      { q: "$x\\times5$ で $x=8$ の とき、式の 値を もとめましょう。", a: "40" },
      { q: "$x\\div3$ で $x=12$ の とき、式の 値を もとめましょう。", a: "4" },
      { q: "$x+x$ で $x=7$ の とき、式の 値を もとめましょう。", a: "14" },
      { q: "$100-x$ で $x=35$ の とき、式の 値を もとめましょう。", a: "65" },
    ], { section: "文字と 式に ついて こたえましょう" }) });

  add(calcPrint({ grade: G, id: "g6-02", unitNo: 2, name: "算数6年② 分数と整数の かけ算・わり算", title: "分数 × ÷ 整数", subtitle: "分数と 整数", goal: "(分数)×(整数)、(分数)÷(整数)が できるように なろう！", desc: "(分数)×(整数)、(分数)÷(整数)の計算。" }, (rng) => [...genFracMulInt(rng, 20), ...genFracDivInt(rng, 18)], 3));

  add(calcPrint({ grade: G, id: "g6-03", unitNo: 3, name: "算数6年③ 分数 × 分数", title: "分数 × 分数", subtitle: "分数の かけ算", goal: "(分数)×(分数)が できるように なろう！", desc: "(分数)×(分数)の意味と計算。" }, (rng) => genFracMul(rng, 36), 3));

  add(calcPrint({ grade: G, id: "g6-04", unitNo: 4, name: "算数6年④ 分数 ÷ 分数", title: "分数 ÷ 分数", subtitle: "分数の わり算", goal: "(分数)÷(分数)が できるように なろう！ ぎゃくすうを かける！", desc: "(分数)÷(分数)の意味と計算、逆数。" }, (rng) => genFracDiv(rng, 36), 3));

  add(calcPrint({ grade: G, id: "g6-05", unitNo: 5, name: "算数6年⑤ 分数の 計算 ミックス", title: "分数の 計算ミックス", subtitle: "× と ÷", goal: "分数の かけ算・わり算を すらすら できるように なろう！", desc: "分数の乗除の習熟。" }, (rng) => [...genFracMul(rng, 16), ...genFracDiv(rng, 16)], 3));

  add({ grade: G, subject: "算数", id: "g6-06", unitNo: 6, name: "算数6年⑥ 対称な 図形", title: "対称な 図形", subtitle: "線対称・点対称", goal: "線対称・点対称の 図形を しらべよう！", desc: "線対称・点対称の定義と性質。",
    body: iplusBody([
      { q: "1本の 直線で おって ぴったり 重なる 図形を 何と いいますか。", a: "線対称" },
      { q: "ある点を 中心に 180度 まわすと もとと 重なる 図形を 何と いいますか。", a: "点対称" },
      { q: "正三角形には 対称の 軸が 何本 ありますか。", a: "3 本" },
      { q: "線対称な 図形で おり目に なる 直線を 何と いいますか。", a: "対称の軸" },
      { q: "正方形には 対称の 軸が 何本 ありますか。", a: "4 本" },
      { q: "長方形には 対称の 軸が 何本 ありますか。", a: "2 本" },
      { q: "円には 対称の 軸が 何本 ありますか。", a: "無数(数えきれない)" },
      { q: "点対称な 図形で 中心と なる 点を 何と いいますか。", a: "対称の中心" },
    ], { section: "対称な 図形に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g6-07", unitNo: 7, name: "算数6年⑦ 円の 面積", title: "円の 面積", subtitle: "半径 × 半径 × 3.14", goal: "円の 面積の もとめ方を おぼえよう！", desc: "円の面積の求め方、面積公式。",
    body: iplusBody([
      { q: "半径 5cm の 円の 面積を もとめましょう。($5\\times5\\times3.14$)", a: "78.5 cm$^2$" },
      { q: "半径 10cm の 円の 面積を もとめましょう。($10\\times10\\times3.14$)", a: "314 cm$^2$" },
      { q: "直径 8cm の 円の 面積を もとめましょう。($4\\times4\\times3.14$)", a: "50.24 cm$^2$" },
      { q: "半径 2cm の 円の 面積を もとめましょう。", a: "12.56 cm$^2$" },
      { q: "半径 3cm の 円の 面積を もとめましょう。", a: "28.26 cm$^2$" },
      { q: "半径 6cm の 円の 面積を もとめましょう。", a: "113.04 cm$^2$" },
      { q: "直径 10cm の 円の 面積を もとめましょう。", a: "78.5 cm$^2$" },
      { q: "半径 1cm の 円の 面積を もとめましょう。", a: "3.14 cm$^2$" },
      { q: "半径 20cm の 円の 面積を もとめましょう。", a: "1256 cm$^2$" },
    ], { section: "円の 面積を もとめましょう(円周率は 3.14)" }) });

  add({ grade: G, subject: "算数", id: "g6-08", unitNo: 8, name: "算数6年⑧ 立体の 体積", title: "立体の 体積", subtitle: "角柱・円柱", goal: "角柱・円柱の 体積 $=$ 底面積 × 高さ！", desc: "角柱・円柱の体積の求め方、体積公式。",
    body: iplusBody([
      { q: "底面積 12cm$^2$、高さ 5cm の 角柱の 体積を もとめましょう。($12\\times5$)", a: "60 cm$^3$" },
      { q: "底面積 20cm$^2$、高さ 8cm の 角柱の 体積を もとめましょう。", a: "160 cm$^3$" },
      { q: "底面の 半径 3cm(底面積 28.26cm$^2$)、高さ 10cm の 円柱の 体積を もとめましょう。", a: "282.6 cm$^3$" },
      { q: "底面積 15cm$^2$、高さ 4cm の 角柱の 体積を もとめましょう。", a: "60 cm$^3$" },
      { q: "底面積 30cm$^2$、高さ 6cm の 角柱の 体積を もとめましょう。", a: "180 cm$^3$" },
      { q: "底面の 半径 2cm(底面積 12.56cm$^2$)、高さ 5cm の 円柱の 体積を もとめましょう。", a: "62.8 cm$^3$" },
      { q: "底面積 25cm$^2$、高さ 10cm の 角柱の 体積を もとめましょう。", a: "250 cm$^3$" },
      { q: "1辺 6cm の 立方体の 体積を もとめましょう。", a: "216 cm$^3$" },
    ], { section: "体積を もとめましょう(底面積 $\\times$ 高さ)" }) });

  add({ grade: G, subject: "算数", id: "g6-09", unitNo: 9, name: "算数6年⑨ 比とその利用", title: "比と その利用", subtitle: "比を かんたんに", goal: "比を かんたんに したり、比の値を もとめよう！", desc: "比の意味、等しい比、比の値、比の利用。",
    body: iplusBody([
      { q: "$12:18$ を かんたんな 比に しましょう。", a: "2:3" },
      { q: "$3:4$ の 比の値を もとめましょう。", a: "$\\frac{3}{4}$" },
      { q: "$2:5=8:\\square$ の □に 入る数を もとめましょう。", a: "20" },
      { q: "$15:25$ を かんたんな 比に しましょう。", a: "3:5" },
      { q: "$8:12$ を かんたんな 比に しましょう。", a: "2:3" },
      { q: "$10:15$ を かんたんな 比に しましょう。", a: "2:3" },
      { q: "$1:4=5:\\square$ の □に 入る数を もとめましょう。", a: "20" },
      { q: "$4:6$ の 比の値を もとめましょう。", a: "$\\frac{2}{3}$" },
      { q: "$9:12$ を かんたんな 比に しましょう。", a: "3:4" },
      { q: "$3:7=\\square:21$ の □に 入る数を もとめましょう。", a: "9" },
    ], { section: "比に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g6-10", unitNo: 10, name: "算数6年⑩ 拡大図と 縮図", title: "拡大図と 縮図", subtitle: "形は そのまま 大きさを かえる", goal: "拡大図・縮図の かんけいを しらべよう！", desc: "拡大図・縮図の定義と性質、縮尺。",
    body: iplusBody([
      { q: "2cm の 辺を 3倍に 拡大すると 何 cm に なりますか。", a: "6 cm" },
      { q: "12cm の 辺を $\\frac{1}{4}$ に 縮小すると 何 cm に なりますか。", a: "3 cm" },
      { q: "縮尺 $\\frac{1}{1000}$ の 図で 5cm は、じっさいには 何 m ですか。", a: "50 m" },
      { q: "3cm の 辺を 4倍に 拡大すると 何 cm に なりますか。", a: "12 cm" },
      { q: "20cm の 辺を $\\frac{1}{5}$ に 縮小すると 何 cm に なりますか。", a: "4 cm" },
      { q: "縮尺 $\\frac{1}{2000}$ の 図で 3cm は、じっさいには 何 m ですか。", a: "60 m" },
      { q: "拡大図や 縮図で 変わらないのは 辺の 長さですか、角の 大きさですか。", a: "角の 大きさ" },
      { q: "2倍の 拡大図に すると、面積は 何倍に なりますか。", a: "4 倍" },
    ], { section: "拡大図と 縮図に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g6-11", unitNo: 11, name: "算数6年⑪ 比例と 反比例", title: "比例と 反比例", subtitle: "y=きまった数×x", goal: "比例と 反比例の 式を つかえるように なろう！", desc: "比例・反比例の意味と性質、式・グラフ。",
    body: iplusBody([
      { q: "$y$ は $x$ に 比例し、$x=2$ の とき $y=10$ です。きまった数を もとめましょう。($y=□\\times x$)", a: "5" },
      { q: "(1)の とき、$x=6$ なら $y$ は いくつですか。", a: "30" },
      { q: "$y$ は $x$ に 反比例し、$x=3$ の とき $y=8$ です。$x=6$ の とき $y$ は いくつですか。", a: "4" },
      { q: "$y=5\\times x$ の とき、$x=10$ なら $y$ は いくつですか。", a: "50" },
      { q: "$y$ は $x$ に 反比例し $x\\times y=24$ です。$x=8$ の とき $y$ は いくつですか。", a: "3" },
      { q: "$y$ は $x$ に 比例し、$x=4$ の とき $y=12$ です。きまった数を もとめましょう。", a: "3" },
      { q: "前の問題で、$x=7$ の とき $y$ は いくつですか。", a: "21" },
      { q: "反比例の グラフは どんな 形の 線に なりますか。", a: "曲線" },
    ], { section: "比例と 反比例に ついて こたえましょう" }) });

  add({ grade: G, subject: "算数", id: "g6-12", unitNo: 12, name: "算数6年⑫ ならべ方と 組み合わせ方", title: "ならべ方と 組み合わせ方", subtitle: "場合の数", goal: "ぜんぶで なんとおり あるか 数えよう！", desc: "並べ方と組み合わせ方、場合の数。",
    body: iplusBody([
      { q: "1, 2, 3 の カードで できる 2けたの 整数は 何とおり ありますか。", a: "6 とおり" },
      { q: "A, B, C, D の 4人から 2人を えらぶ 組み合わせは 何とおり ありますか。", a: "6 とおり" },
      { q: "赤・青・黄 の 3色から 2色を えらぶ 組み合わせは 何とおり ありますか。", a: "3 とおり" },
      { q: "1, 2, 3, 4 の カードで できる 2けたの 整数は 何とおり ありますか。", a: "12 とおり" },
      { q: "A, B, C の 3人を 1列に ならべる ならべ方は 何とおり ありますか。", a: "6 とおり" },
      { q: "4人から 3人を えらぶ 組み合わせは 何とおり ありますか。", a: "4 とおり" },
      { q: "5人から 2人を えらぶ 組み合わせは 何とおり ありますか。", a: "10 とおり" },
      { q: "コインを 2枚 投げる ときの 表・裏の 出方は 何とおり ありますか。", a: "4 とおり" },
    ], { section: "ならべ方と 組み合わせ方を 数えましょう" }) });

  add({ grade: G, subject: "算数", id: "g6-13", unitNo: 13, name: "算数6年⑬ 資料の 整理", title: "資料の 整理", subtitle: "平均値・中央値・最頻値", goal: "データの 代表値(平均値・中央値・最頻値)を もとめよう！", desc: "代表値(平均値・中央値・最頻値)、度数分布。",
    body: iplusBody([
      { q: "平均値を もとめましょう。($(2+3+3+4+5+5+5+6+9)\\div9$)", a: "約 4.67 点" },
      { q: "中央値(まんなかの 値)を もとめましょう。", a: "5 点" },
      { q: "最頻値(いちばん 多い 値)を もとめましょう。", a: "5 点" },
      { q: "さいだい値を もとめましょう。", a: "9 点" },
      { q: "さいしょう値を もとめましょう。", a: "2 点" },
      { q: "はんい(さいだい値 $-$ さいしょう値)を もとめましょう。", a: "7 点" },
      { q: "5点 いじょうの 人は 何人 いますか。", a: "4 人" },
    ], { section: "データの 代表値を もとめましょう", intro: "{\\large つぎの 9この データ\\quad 2, 3, 3, 4, 5, 5, 5, 6, 9 (点)}" }) });

  add(calcPrint({ grade: G, id: "g6-14", unitNo: 14, name: "算数6年⑭ 6年の まとめ", title: "6年の まとめ", subtitle: "分数の 四則", goal: "6年で ならった 分数の 計算の しあげ！ 中学への 橋わたし！", desc: "6年の計算の総合復習、中学への接続。" }, (rng) => [...genFracMul(rng, 11), ...genFracDiv(rng, 11), ...genFracDiff(rng, 11)], 3));

  return P;
}

export const prints = [...buildG1(), ...buildG2(), ...buildG3(), ...buildG4(), ...buildG5(), ...buildG6()];
