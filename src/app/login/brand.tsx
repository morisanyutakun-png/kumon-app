/* オリジナルのロゴマークとログイン用イラスト (SVG)。 */

/** ロゴマーク: 角丸スクエア + 卒業帽モチーフ。 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="まなび教室">
      <defs>
        <linearGradient id="bm-g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#bm-g)" />
      {/* 卒業帽 */}
      <path d="M20 11l11 4.6-11 4.6-11-4.6L20 11z" fill="#fff" />
      <path d="M13 18.4v4.4c0 1.9 3.1 3.4 7 3.4s7-1.5 7-3.4v-4.4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" fill="none" opacity="0.95" />
      <path d="M31 15.6v5.2" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="31" cy="22" r="1.7" fill="#fbbf24" />
    </svg>
  );
}

/** ログイン左パネルのヒーローイラスト (抽象的な学習シーン)。 */
export function LoginArt() {
  return (
    <svg className="login-art" viewBox="0 0 360 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* 背景の柔らかい円 */}
      <circle cx="300" cy="60" r="70" fill="#fff" opacity="0.06" />
      <circle cx="60" cy="250" r="54" fill="#fff" opacity="0.06" />

      {/* メインのプリント(ワークシート) */}
      <g transform="rotate(-5 170 160)">
        <rect x="78" y="70" width="184" height="176" rx="18" fill="#ffffff" />
        <rect x="78" y="70" width="184" height="44" rx="18" fill="#dbeafe" />
        <rect x="78" y="96" width="184" height="18" fill="#dbeafe" />
        <rect x="98" y="84" width="86" height="12" rx="6" fill="#60a5fa" />
        <rect x="98" y="132" width="142" height="10" rx="5" fill="#e2e8f0" />
        <rect x="98" y="152" width="120" height="10" rx="5" fill="#e2e8f0" />
        <rect x="98" y="172" width="134" height="10" rx="5" fill="#e2e8f0" />
        <rect x="98" y="192" width="96" height="10" rx="5" fill="#e2e8f0" />
        <rect x="98" y="212" width="110" height="10" rx="5" fill="#e2e8f0" />
      </g>

      {/* 合格チェックのバッジ */}
      <g transform="translate(212 196)">
        <circle cx="26" cy="26" r="30" fill="#10b981" />
        <circle cx="26" cy="26" r="30" stroke="#ffffff" strokeWidth="3" opacity="0.25" />
        <path d="M15 27l7 7 14-15" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>

      {/* 成績カード(右上) */}
      <g transform="translate(236 56)">
        <rect width="92" height="78" rx="14" fill="#ffffff" />
        <rect x="14" y="48" width="12" height="18" rx="3" fill="#93c5fd" />
        <rect x="34" y="36" width="12" height="30" rx="3" fill="#60a5fa" />
        <rect x="54" y="24" width="12" height="42" rx="3" fill="#2563eb" />
        <rect x="14" y="16" width="40" height="8" rx="4" fill="#e2e8f0" />
      </g>

      {/* えんぴつ */}
      <g transform="rotate(38 120 250)">
        <rect x="84" y="232" width="92" height="16" rx="4" fill="#fbbf24" />
        <rect x="84" y="232" width="18" height="16" fill="#f59e0b" />
        <path d="M176 232l16 8-16 8z" fill="#fcd34d" />
        <path d="M188 238l4 2-4 2z" fill="#1f2937" />
      </g>

      {/* 装飾の小ドット */}
      <circle cx="300" cy="170" r="5" fill="#fff" opacity="0.5" />
      <circle cx="50" cy="120" r="4" fill="#fff" opacity="0.45" />
      <circle cx="324" cy="210" r="3" fill="#fff" opacity="0.4" />
    </svg>
  );
}
