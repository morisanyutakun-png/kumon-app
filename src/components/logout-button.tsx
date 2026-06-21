"use client";

import { logoutAction } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="sm">
        ログアウト
      </Button>
    </form>
  );
}
