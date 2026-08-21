import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type UatRole = {
  env: string;
  label: string;
  loginPath: string;
  landingPath: RegExp;
  internal?: boolean;
  forbiddenLabels?: string[];
};

const roles: UatRole[] = [
  { env: "OWNER", label: "Chủ cửa hàng", loginPath: "/login", landingPath: /^\/dashboard(?:\/|$)/, internal: true },
  { env: "ACCOUNTANT", label: "Kế toán", loginPath: "/login", landingPath: /^\/dashboard(?:\/|$)/, internal: true, forbiddenLabels: ["Giá vốn", "Biên lợi nhuận"] },
  { env: "WAREHOUSE", label: "Kho", loginPath: "/login", landingPath: /^\/dashboard(?:\/|$)/, internal: true, forbiddenLabels: ["Quỹ và ngân hàng"] },
  { env: "DISPATCHER", label: "Điều phối", loginPath: "/login", landingPath: /^\/dashboard(?:\/|$)/, internal: true, forbiddenLabels: ["Quỹ và ngân hàng"] },
  { env: "DRIVER", label: "Tài xế", loginPath: "/login", landingPath: /^\/dashboard(?:\/|$)/, internal: true, forbiddenLabels: ["Giá vốn", "Biên lợi nhuận", "Công nợ khách hàng"] },
  { env: "WORKER", label: "Thợ", loginPath: "/login", landingPath: /^\/dashboard(?:\/|$)/, internal: true, forbiddenLabels: ["Giá vốn", "Biên lợi nhuận", "Công nợ khách hàng"] },
  { env: "CUSTOMER", label: "Khách hàng", loginPath: "/khach-hang/dang-nhap", landingPath: /^\/khach-hang(?:\/|$)/ },
  { env: "SUPPLIER", label: "Nhà cung cấp", loginPath: "/nha-cung-cap/dang-nhap", landingPath: /^\/nha-cung-cap(?:\/|$)/ }
];

function credential(role: UatRole, field: "USERNAME" | "PASSWORD") {
  const name = `E2E_${role.env}_${field}`;
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc ${name} cho authenticated staging UAT.`);
  return value;
}

async function analyzeAxeAfterNavigationSettles(page: Page) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await new AxeBuilder({ page }).analyze();
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/Execution context was destroyed/i.test(error.message)) throw error;
      await page.waitForTimeout(250);
    }
  }
  throw lastError;
}

async function hasHorizontalOverflowAfterNavigationSettles(page: Page) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/Execution context was destroyed/i.test(error.message)) throw error;
      await page.waitForTimeout(250);
    }
  }
  throw lastError;
}

for (const role of roles) {
  test(`${role.label} đăng nhập đúng phạm vi và không rò rỉ dữ liệu`, async ({ page }, testInfo) => {
    await page.goto(role.loginPath);
    await page.getByLabel(/tên đăng nhập(?: hoặc email)?/i).fill(credential(role, "USERNAME"));
    await page.getByLabel("Mật khẩu").fill(credential(role, "PASSWORD"));
    await page.getByRole("button", { name: /^Đăng nhập/ }).click();
    await expect.poll(() => new URL(page.url()).pathname).toMatch(role.landingPath);
    await expect(page.locator("main.erp-v2-main, main.customer-portal, main.supplier-portal").first()).toBeVisible();

    if (role.internal) {
      await expect(page.getByRole("heading", { name: "Điều hành theo số liệu thật" })).toBeVisible();
    }

    for (const label of role.forbiddenLabels ?? []) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }

    const hasHorizontalOverflow = await hasHorizontalOverflowAfterNavigationSettles(page);
    expect(hasHorizontalOverflow).toBe(false);

    if (testInfo.project.name === "authenticated-1440") {
      const results = await analyzeAxeAfterNavigationSettles(page);
      expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
    }
  });
}

test("ERP shell remains mounted while navigating between internal modules", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/tên đăng nhập(?: hoặc email)?/i).fill(credential(roles[0]!, "USERNAME"));
  await page.getByLabel("Mật khẩu").fill(credential(roles[0]!, "PASSWORD"));
  await page.getByRole("button", { name: /^Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
  const shell = page.locator(".erp-v2-shell");
  const sidebar = page.getByRole("complementary", { name: "Điều hướng ERP" });
  await expect(shell).toBeVisible();
  await expect(sidebar).toBeVisible();
  const mobileMenu = page.locator(".erp-v2-mobile-menu");
  if (await mobileMenu.isVisible()) {
    await page.getByText("Mở menu ERP V2", { exact: true }).click();
  }
  await page.getByRole("link", { name: "Phải thu", exact: true }).click();
  await expect(page).toHaveURL(/\/receivables(?:\/|$)/);
  await expect(shell).toBeVisible();
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("link", { name: "Phải thu", exact: true })).toHaveAttribute("aria-current", "page");
});
