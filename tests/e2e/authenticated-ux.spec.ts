import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type UatRole = {
  env: string;
  label: string;
  loginPath: string;
  landingPath: RegExp;
  expectedNavigation?: string;
  forbiddenText?: RegExp;
};

const roles: UatRole[] = [
  { env: "OWNER", label: "Chủ cửa hàng", loginPath: "/login", landingPath: /^\/$/, expectedNavigation: "Tổng quan" },
  { env: "ACCOUNTANT", label: "Kế toán", loginPath: "/login", landingPath: /^\/$/, expectedNavigation: "Công nợ" },
  { env: "WAREHOUSE", label: "Kho", loginPath: "/login", landingPath: /^\/$/, expectedNavigation: "Kho", forbiddenText: /Quỹ và ngân hàng/i },
  { env: "DISPATCHER", label: "Điều phối", loginPath: "/login", landingPath: /^\/$/, expectedNavigation: "Giao hàng", forbiddenText: /Quỹ và ngân hàng/i },
  { env: "DRIVER", label: "Tài xế", loginPath: "/login", landingPath: /^\/$/, expectedNavigation: "Giao hàng", forbiddenText: /Giá vốn|Biên lợi nhuận|Công nợ khách hàng/i },
  { env: "WORKER", label: "Thợ", loginPath: "/login", landingPath: /^\/$/, expectedNavigation: "Nhân công", forbiddenText: /Giá vốn|Biên lợi nhuận|Công nợ khách hàng/i },
  { env: "CUSTOMER", label: "Khách hàng", loginPath: "/khach-hang/dang-nhap", landingPath: /^\/khach-hang(?:\/|$)/ },
  { env: "SUPPLIER", label: "Nhà cung cấp", loginPath: "/nha-cung-cap/dang-nhap", landingPath: /^\/nha-cung-cap(?:\/|$)/ }
];

function credential(role: UatRole, field: "USERNAME" | "PASSWORD") {
  const name = `E2E_${role.env}_${field}`;
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc ${name} cho authenticated staging UAT.`);
  return value;
}

async function revealNavigation(page: Page) {
  const menuButton = page.getByRole("button", { name: /mở menu/i });
  if (await menuButton.isVisible().catch(() => false)) await menuButton.click();
}

for (const role of roles) {
  test(`${role.label} đăng nhập đúng phạm vi và không rò rỉ dữ liệu`, async ({ page }, testInfo) => {
    await page.goto(role.loginPath);
    await page.getByLabel(/tên đăng nhập hoặc email/i).fill(credential(role, "USERNAME"));
    await page.getByLabel("Mật khẩu").fill(credential(role, "PASSWORD"));
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(role.landingPath);
    await expect(page.locator("main")).toBeVisible();

    if (role.expectedNavigation) {
      await revealNavigation(page);
      await expect(page.getByRole("button", { name: role.expectedNavigation, exact: true }).first()).toBeVisible();
    }

    if (role.forbiddenText) {
      await expect(page.locator("body")).not.toContainText(role.forbiddenText);
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);

    if (testInfo.project.name === "authenticated-1440") {
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
    }
  });
}
