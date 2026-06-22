/* オリジナルのロゴマーク (フラット単色)。 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="まなび教室">
      <rect width="40" height="40" rx="10" fill="#1f3b66" />
      {/* 卒業帽 */}
      <path d="M20 11l11 4.6-11 4.6-11-4.6L20 11z" fill="#fff" />
      <path d="M13 18.4v4.4c0 1.9 3.1 3.4 7 3.4s7-1.5 7-3.4v-4.4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      <path d="M31 15.6v5.4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="31" cy="22.2" r="1.6" fill="#f4b740" />
    </svg>
  );
}
