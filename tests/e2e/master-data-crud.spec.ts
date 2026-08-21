import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

const routes = [
  { kind: "customers", label: "khách hàng", id: "cus-minh-anh" },
  { kind: "suppliers", label: "nhà cung cấp", id: "sup-hoang-thach" },
  { kind: "products", label: "vật tư", id: "pu-cement-bag" },
  { kind: "warehouses", label: "kho / bãi", id: "wh-main" },
  { kind: "vehicles", label: "phương tiện", id: "vehicle-truck-01" },
  { kind: "employees", label: "nhân sự", id: "emp-driver-dung" }
] as const;

test("owner can render all master-data create and edit surfaces", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/tên đăng nhập(?: hoặc email)?/i).fill(process.env.E2E_OWNER_USERNAME ?? "");
  await page.getByLabel("Mật khẩu").fill(process.env.E2E_OWNER_PASSWORD ?? "");
  await page.getByRole("button", { name: /^Đăng nhập/ }).click();
  await expect(page).toHaveURL(new RegExp("/dashboard(?:/|$)"));

  for (const route of routes) {
    await page.goto("/catalog/" + route.kind + "/new");
    await expect(page.getByRole("heading", { name: new RegExp("Tạo " + route.label, "i") })).toBeVisible();
    await expect(page.locator("form.erp-v2-crud-form")).toBeVisible();

    await page.goto("/catalog/" + route.kind + "/" + route.id + "/edit");
    await expect(page.getByRole("heading", { name: new RegExp("Chỉnh sửa " + route.label, "i") })).toBeVisible();
    await expect(page.locator("form.erp-v2-crud-form")).toBeVisible();
  }
});
