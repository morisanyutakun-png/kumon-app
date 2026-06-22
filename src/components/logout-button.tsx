"use client";

import { logoutAction } from "@/lib/actions/auth-actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="db-badge">
        ログアウト
      </button>
    </form>
  );
}
