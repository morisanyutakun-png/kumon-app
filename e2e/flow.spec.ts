import { test, expect } from "@playwright/test";

import { loginStaff, loginStudent, tinyPng } from "./helpers";

/**
 * 基本フロー (7ステップ) を UI で通す:
 *  生徒/教材登録 → 課題割当 → 生徒が答案提出 → 運営が採点・返却 → 生徒が結果確認・完了
 */
test("課題登録→提出→採点→返却→確認の一連フロー", async ({ browser }) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  const studentName = `E2E太郎_${ts}`;
  const grade = "小1";
  const loginId = `e2e_${ts}`;
  const pin = "9999";
  const materialName = `E2E教材_${ts}`;
  const subject = "算数";
  const assignmentTitle = `E2E課題_${ts}`;

  // ---- 運営コンテキスト ----
  const opCtx = await browser.newContext();
  const op = await opCtx.newPage();
  await loginStaff(op, "operator@example.com", "password123");
  await expect(op).toHaveURL(/\/dashboard/);

  // 生徒を登録
  await op.goto("/students");
  await op.locator("#name").fill(studentName);
  await op.locator("#grade").fill(grade);
  await op.locator("#loginId").fill(loginId);
  await op.locator("#pin").fill(pin);
  await op.getByRole("button", { name: "追加", exact: true }).click();
  await expect(op.getByText(studentName)).toBeVisible();

  // 教材を登録
  await op.goto("/materials");
  await op.locator("#name").fill(materialName);
  await op.locator("#subject").fill(subject);
  await op.getByRole("button", { name: "追加", exact: true }).click();
  await expect(op.getByText(materialName)).toBeVisible();

  // 課題を割当
  await op.goto("/assignments");
  await op.locator("#studentId").selectOption({ label: `${studentName} (${grade})` });
  await op.locator("#materialId").selectOption({ label: `[${subject}] ${materialName}` });
  await op.locator("#title").fill(assignmentTitle);
  await op.locator("#rangeText").fill("はん1");
  await op.getByRole("button", { name: "割り当てる" }).click();
  await expect(op.getByText(assignmentTitle).first()).toBeVisible();

  // ---- 生徒コンテキスト ----
  const stCtx = await browser.newContext();
  const st = await stCtx.newPage();
  await loginStudent(st, loginId, pin);
  await expect(st).toHaveURL(/\/home/);

  // 課題を開く
  await st.getByText(assignmentTitle).click();
  await expect(st).toHaveURL(/\/submissions\//);
  const submissionUrl = st.url();

  // 答案画像を提出
  await st.locator('input[name="images"]').setInputFiles({
    name: "answer.png",
    mimeType: "image/png",
    buffer: tinyPng(),
  });
  await st.getByRole("button", { name: "提出する" }).click();
  await expect(st.getByText("提出を受け付けました。採点結果をお待ちください。")).toBeVisible();

  // ---- 運営が採点 ----
  await op.goto("/grading?status=submitted");
  await op
    .locator("tr", { hasText: studentName })
    .getByRole("link", { name: "開く" })
    .click();
  await expect(op).toHaveURL(/\/grading\//);

  await op.getByRole("button", { name: "採点を開始" }).click();
  await op.locator("#score").fill("80");
  await op.locator("#maxScore").fill("100");
  await op.locator(".radio.ok").first().click(); // 合否=合格 (セグメンテッド)
  await op.getByRole("button", { name: "採点結果を返却" }).click();
  // 返却済みバッジ
  await expect(op.getByText("返却済み").first()).toBeVisible();

  // ---- 生徒が結果確認 → 完了 ----
  await st.goto(submissionUrl);
  await expect(st.getByText("採点結果・コメント")).toBeVisible();
  await expect(st.getByText("合格", { exact: true }).first()).toBeVisible();
  await expect(st.getByText("80", { exact: false }).first()).toBeVisible();
  await st.getByRole("button", { name: "確認して完了にする" }).click();
  await expect(st.getByText("この課題は完了しました。おつかれさまでした！")).toBeVisible();

  await opCtx.close();
  await stCtx.close();
});
