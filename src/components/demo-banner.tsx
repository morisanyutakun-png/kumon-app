import Link from "next/link";

import { isDemoMode } from "@/lib/demo";

/** デモモード時のみ表示する案内バー。 */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="bg-amber-500 px-4 py-1.5 text-center text-xs text-white">
      デモモード（ゲスト）で表示中。データは一時的で再起動でリセットされます。
      <Link href="/login" className="ml-2 underline">
        ロールを切り替える
      </Link>
    </div>
  );
}
