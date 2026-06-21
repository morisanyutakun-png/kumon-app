import { type Page, expect } from "@playwright/test";

/** 運営・保護者 (email + password) でログイン。 */
export async function loginStaff(page: Page, email: string, password: string) {
  await page.goto("/login");
  // 既定タブが「運営・保護者」
  await page.locator("#staff-email").fill(email);
  await page.locator("#staff-password").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

/** 生徒 (loginId + PIN) でログイン。 */
export async function loginStudent(page: Page, loginId: string, pin: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "生徒" }).click();
  await page.locator("#student-id").fill(loginId);
  await page.locator("#student-pin").fill(pin);
  await page.getByRole("button", { name: "ログイン" }).click();
}

/** 1x1 透明 PNG のバイト列 (テスト用答案画像)。 */
export function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
}

export { expect };
