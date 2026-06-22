import { type Page, expect } from "@playwright/test";

/** 全アカウント共通ログイン (ID + パスワード)。 */
export async function login(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

/** 運営・保護者 (email + password)。共通フォームを使う。 */
export async function loginStaff(page: Page, email: string, password: string) {
  await login(page, email, password);
}

/** 生徒 (loginId + PIN)。共通フォームを使う。 */
export async function loginStudent(page: Page, loginId: string, pin: string) {
  await login(page, loginId, pin);
}

/** 1x1 透明 PNG のバイト列 (テスト用答案画像)。 */
export function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
}

export { expect };
