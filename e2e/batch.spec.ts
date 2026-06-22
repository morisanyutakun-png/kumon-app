import { test, expect } from "@playwright/test";

import { loginStaff, loginStudent, tinyPng } from "./helpers";

/** Excel風 一括採点(添削スプレッドシート)で 提出済み → 合格返却 までを検証。 */
test("一括採点で合格返却 → 生徒が結果確認", async ({ browser }) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  const studentName = `B太郎_${ts}`;
  const grade = "小2";
  const loginId = `eb_${ts}`;
  const pin = "8888";
  const materialName = `B教材_${ts}`;
  const subject = "国語";

  const opCtx = await browser.newContext();
  const op = await opCtx.newPage();
  await loginStaff(op, "operator@example.com", "password123");
  await expect(op).toHaveURL(/\/dashboard/);

  // 生徒・教材・課題を用意
  await op.goto("/students");
  await op.locator("summary", { hasText: "生徒を追加" }).click();
  await op.locator("#name").fill(studentName);
  await op.locator("#grade").fill(grade);
  await op.locator("#loginId").fill(loginId);
  await op.locator("#pin").fill(pin);
  await op.getByRole("button", { name: "登録する" }).click();
  await expect(op.getByText(studentName).first()).toBeVisible();

  await op.goto("/materials");
  await op.locator("summary", { hasText: "教材を追加" }).click();
  await op.locator("#name").fill(materialName);
  await op.locator("#subject").fill(subject);
  await op.getByRole("button", { name: "登録する" }).click();
  await expect(op.getByText(materialName).first()).toBeVisible();

  await op.goto("/assignments");
  const arow = op.locator("tr", { hasText: studentName });
  await arow.locator('select[name="materialId"]').selectOption({ label: `[${subject}] ${materialName}` });
  await arow.getByRole("button", { name: "＋ 追加" }).click();
  await expect(arow.locator(".ag-mat", { hasText: materialName })).toBeVisible();

  // 生徒が提出
  const stCtx = await browser.newContext();
  const st = await stCtx.newPage();
  await loginStudent(st, loginId, pin);
  await expect(st).toHaveURL(/\/home/);
  await st.getByText(materialName).first().click();
  await expect(st).toHaveURL(/\/submissions\//);
  const submissionUrl = st.url();
  await st.locator('input[name="images"]').setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: tinyPng(),
  });
  await st.getByRole("button", { name: "提出する" }).click();
  await expect(st.getByText("提出を受け付けました。採点結果をお待ちください。")).toBeVisible();

  // 一括採点(添削スプレッドシート。列=提出物)
  await op.goto("/grading/batch");
  const grid = op.locator(".entry-grid");
  await expect(grid.getByText(studentName)).toBeVisible();
  await grid.locator('input[type="number"]').first().fill("90"); // 得点
  await grid.locator('input[type="number"]').nth(1).fill("100"); // 満点
  await grid.locator(".radio.ok").first().click(); // 合否=合格
  await grid.locator("select").first().selectOption("return"); // 操作=返却
  await op.getByRole("button", { name: "入力した列をまとめて返却" }).click();
  await expect(op.getByText("件を処理しました。", { exact: false })).toBeVisible();

  // 生徒が結果確認
  await st.goto(submissionUrl);
  await expect(st.getByText("採点結果・コメント")).toBeVisible();
  await expect(st.getByText("合格", { exact: true }).first()).toBeVisible();

  await opCtx.close();
  await stCtx.close();
});
