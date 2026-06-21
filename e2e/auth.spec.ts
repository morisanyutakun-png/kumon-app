import { test, expect } from "@playwright/test";

import { loginStaff } from "./helpers";

test("未ログインで保護ページへ行くと /login へ", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("誤った認証情報はエラー表示", async ({ page }) => {
  await loginStaff(page, "operator@example.com", "wrong-password");
  await expect(page.getByText("ログイン情報が正しくありません。")).toBeVisible();
});

test("運営者ログイン → ダッシュボード", async ({ page }) => {
  await loginStaff(page, "operator@example.com", "password123");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "ダッシュボード" }),
  ).toBeVisible();
});
