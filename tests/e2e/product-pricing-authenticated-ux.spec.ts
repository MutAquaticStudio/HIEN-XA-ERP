import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function credential(role: "OWNER" | "WAREHOUSE", field: "USERNAME" | "PASSWORD") {
  const name = `E2E_${role}_${field}`;
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường local QA ${name}.`);
  return value;
}

async function login(page: Page, role: "OWNER" | "WAREHOUSE") {
  await page.goto("/login");
  await page.getByLabel(/tên đăng nhập(?: hoặc email)?/i).fill(credential(role, "USERNAME"));
  await page.getByLabel("Mật khẩu").fill(credential(role, "PASSWORD"));
  await page.getByRole("button", { name: /^Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
}

test("giá vật tư tính hai chiều, hiển thị đúng và không rò rỉ ra portal", async ({ page }, testInfo) => {
  await login(page, "OWNER");

  await page.goto("/catalog/products/new");
  await expect(page.getByRole("heading", { name: /tạo vật tư/i })).toBeVisible();
  await page.getByLabel("Giá nhập (VND)").fill("100000");
  await page.getByLabel("% lãi trên giá nhập").fill("15");
  await expect(page.getByLabel("Giá bán (VND)")).toHaveValue("115000");
  await page.getByLabel("Giá bán (VND)").fill("120000");
  await expect(page.getByLabel("% lãi trên giá nhập")).toHaveValue("20");
  await expect(page.getByText(/Giá máy chủ: 120\.000/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);

  if (testInfo.project.name === "authenticated-1440") {
    await page.getByLabel("Mã vật tư").fill("PW-PRICE-1440");
    await page.getByLabel("Tên vật tư").fill("Vật tư Playwright pricing");
    await page.getByLabel("Đơn vị tồn kho gốc").selectOption({ index: 1 });
    await page.getByLabel("VAT (%, 0–100)").fill("8");
    await page.getByRole("button", { name: "Tạo vật tư" }).click();
    await expect(page).toHaveURL(/\/catalog\/products\/[^/?]+\?created=1$/);
    await expect(page.getByText("Đã tạo bản ghi authoritative thành công.", { exact: false })).toBeVisible();
    await expect(page.getByText("GIÁ & THƯƠNG MẠI", { exact: true })).toBeVisible();
    await expect(page.getByText("120.000 ₫", { exact: true }).first()).toBeVisible();
  } else {
    await page.goto("/catalog/products/pu-cement-bag");
    await expect(page.getByText("GIÁ & THƯƠNG MẠI", { exact: true })).toBeVisible();
    await expect(page.getByText("Giá master dùng cho chứng từ mới", { exact: false })).toBeVisible();
  }

  await page.goto("/dat-hang");
  await expect(page.getByRole("heading", { name: /chọn đúng vật liệu/i })).toBeVisible();
  await expect(page.getByText("Giá nhập", { exact: true })).toHaveCount(0);
  await expect(page.getByText("% lãi", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Lãi / đơn vị", { exact: true })).toHaveCount(0);

  if (testInfo.project.name === "authenticated-1440") {
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

    await page.context().clearCookies();
    await login(page, "WAREHOUSE");
    await page.goto("/catalog/products");
    await expect(page.getByRole("columnheader", { name: "Giá nhập" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "% lãi" })).toHaveCount(0);
    await page.goto("/catalog/products/new");
    await expect(page).toHaveURL(/\/catalog\/products$/);
  }
});
