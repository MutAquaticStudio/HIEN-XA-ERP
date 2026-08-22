import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("trang đăng nhập có thể dùng bằng bàn phím và không có lỗi accessibility nghiêm trọng", async ({ page }, testInfo) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /đăng nhập hệ thống/i })).toBeVisible();
  if (["chromium-390", "chromium-1440"].includes(testInfo.project.name)) {
    await expect(page).toHaveScreenshot("login.png", { animations: "disabled", fullPage: true });
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /bỏ qua menu/i })).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
});

test("trang đặt hàng không tràn ngang và có visual ổn định", async ({ page }, testInfo) => {
  await page.goto("/dat-hang");
  await expect(page.getByRole("heading", { name: /chọn đúng vật liệu/i })).toBeVisible();
  await expect(page.getByLabel("Tiến trình đặt hàng")).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
  if (["chromium-390", "chromium-1440"].includes(testInfo.project.name)) {
    await expect(page).toHaveScreenshot("customer-order.png", { animations: "disabled", fullPage: true });
  }
});

test("wizard đặt hàng chuyển bước độc lập với visual assertion", async ({ page }) => {
  await page.goto("/dat-hang");
  const increaseButtons = page.locator('button[aria-label^="Tăng số lượng"]:not(:disabled)');
  if (await increaseButtons.count()) {
    await increaseButtons.first().click();
    await page.getByRole("button", { name: /tiếp tục nhập thông tin giao/i }).click();
    await expect(page.getByRole("heading", { name: /thông tin giao và thanh toán/i })).toBeVisible();
  } else {
    const emptyCatalog = page.getByText(/chưa có vật liệu công khai giá/i);
    const productCards = page.locator('[class*="productCard"]');
    if (await emptyCatalog.count()) {
      await expect(emptyCatalog).toBeVisible();
    } else {
      await expect(productCards.first()).toBeVisible();
      await expect(productCards.first()).toContainText(/liên hệ để nhận giá|tạm dừng nhận đơn|cần báo giá|hỏi cửa hàng/i);
    }
  }
});

test("trang không tồn tại dùng thông báo tiếng Việt", async ({ page }) => {
  await page.goto("/duong-dan-khong-ton-tai");
  await expect(page.getByRole("heading", { name: /đường dẫn này không còn sử dụng/i })).toBeVisible();
});
