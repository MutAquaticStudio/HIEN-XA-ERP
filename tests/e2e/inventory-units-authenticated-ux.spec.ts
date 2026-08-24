import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function credential(field: "USERNAME" | "PASSWORD") {
  const name = `E2E_OWNER_${field}`;
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc ${name} cho authenticated local QA.`);
  return value;
}

test("Kho tổng hợp và Đơn vị & quy đổi hiển thị đúng trên mọi viewport", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel(/tên đăng nhập(?: hoặc email)?/i).fill(credential("USERNAME"));
  await page.getByLabel("Mật khẩu").fill(credential("PASSWORD"));
  await page.getByRole("button", { name: /^Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);

  await page.goto("/inventory/stock");
  await expect(page.getByRole("heading", { name: "Tồn kho hiện tại" })).toBeVisible();
  await expect(page.getByText(/Revision \d+ · Đã đồng bộ/)).toBeVisible();
  for (const label of ["Tồn kho hiện tại", "Phát sinh kho", "Tồn đầu kỳ & chuyển kho", "Kiểm kê & điều chỉnh", "Ngoại lệ tồn âm"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Số tồn được tính từ phát sinh append-only", { exact: false })).toBeVisible();

  const quickCount = page.getByRole("button", { name: "Điều chỉnh tồn" }).first();
  await expect(quickCount).toBeVisible();
  await quickCount.click();
  await expect(page.getByRole("dialog", { name: "Điều chỉnh tồn" })).toBeVisible();
  await expect(page.getByText("Tồn sổ hiện tại", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Số lượng thực tế mới")).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(page.getByRole("dialog", { name: "Điều chỉnh tồn" })).toBeVisible();
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByRole("dialog", { name: "Điều chỉnh tồn" })).toHaveCount(0);

  await page.goto("/inventory/movements");
  await expect(page).toHaveURL(/\/inventory\/stock\?section=movements/);
  await expect(page.getByRole("heading", { name: "Phát sinh kho" })).toBeVisible();

  await page.goto("/inventory/counts");
  await expect(page).toHaveURL(/\/inventory\/stock\?section=counts/);
  await expect(page.getByRole("heading", { name: "Phiếu kiểm kê theo kho" })).toBeVisible();

  await page.goto("/catalog/units");
  await expect(page.getByRole("heading", { name: "Đơn vị & quy đổi", level: 1 })).toBeVisible();
  await expect(page.getByText("Product Unit Workspace", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đơn vị đã cấu hình" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Danh mục tên đơn vị" })).toBeVisible();
  for (const column of ["Đơn vị", "Chế độ", "Quy đổi", "Tương đương gốc", "Mua", "Bán", "Portal", "Trạng thái", "Thao tác"]) {
    await expect(page.getByRole("columnheader", { name: column, exact: true, includeHidden: true })).toHaveCount(1);
  }

  const addConversion = page.getByRole("button", { name: "Thêm quy đổi" });
  await expect(addConversion).toBeEnabled();
  await addConversion.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Không dùng công thức chạy tự do", { exact: false })).toBeVisible();
  const mode = dialog.getByLabel("Chế độ");
  await expect(mode).toBeVisible();
  await expect(mode.locator("option")).toHaveText(["Tỷ lệ cố định", "Nhiều cấp", "Theo thực nhận", "Theo kích thước"]);
  await dialog.getByLabel(/Hệ số về/).fill("2");
  await expect(dialog.getByText(/^1 .+ = 2 .+\.$/)).toBeVisible();
  await dialog.getByRole("button", { name: "Đóng" }).click();
  await expect(dialog).toHaveCount(0);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(horizontalOverflow).toBe(false);

  if (testInfo.project.name === "authenticated-1440") {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  }
});
