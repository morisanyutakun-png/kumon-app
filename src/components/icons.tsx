/* 学習プラットフォーム用のシンプルなアイコン (絵文字の置き換え)。currentColor 連動。 */
type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconFlame({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3c.5 2.5 2.5 3.8 3.6 5.4A6 6 0 1 1 6 12c0-1.6.7-2.9 1.6-3.8.3 1 .9 1.7 1.8 2 .2-2.6 1.2-5 2.6-7.2z" />
    </svg>
  );
}
export function IconStar({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}
export function IconMedal({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 3l2.5 5M16 3l-2.5 5" />
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="M12 11.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconCheck({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.6 2.6L16 9.4" />
    </svg>
  );
}
export function IconCalendar({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="5" width="16" height="16" rx="1.5" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}
export function IconRedo({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
