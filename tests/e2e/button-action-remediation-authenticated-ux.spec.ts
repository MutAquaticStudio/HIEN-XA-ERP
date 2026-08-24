import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function credential(role: "OWNER" | "WORKER", field: "USERNAME" | "PASSWORD") {
  const name = `E2E_${role}_${field}`;
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name} cho button/action QA.`);
  return value;
}

async function login(page: Page, role: "OWNER" | "WORKER") {
  await page.goto("/login");
  await page.getByLabel(/tên đăng nhập(?: hoặc email)?/i).fill(credential(role, "USERNAME"));
  await page.getByLabel("Mật khẩu").fill(credential(role, "PASSWORD"));
  await page.getByRole("button", { name: /^Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
}

test("các control P2/P3 được render, xác nhận rõ và dùng được trên mọi viewport", async ({ page }, testInfo) => {
  await login(page, "OWNER");

  await page.goto("/receivables");
  await page.getByLabel("Phạm vi khách hàng").selectOption("uat-uxv2-customer");
  await expect(page.getByRole("heading", { name: "Theo dõi thu hồi công nợ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Giao phụ trách" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu nhật ký" })).toBeVisible();

  await page.goto("/catalog/units");
  const unitName = `qa-${testInfo.project.name}-${Date.now()}`.slice(0, 40);
  await page.getByLabel("Tên đơn vị mới").fill(unitName);
  await page.getByRole("button", { name: "Thêm đơn vị" }).click();
  const unitRow = page.locator(".erp-v2-unit-row").filter({ hasText: unitName });
  await expect(unitRow).toBeVisible();
  await unitRow.getByRole("button", { name: "Xóa" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: new RegExp(`Xóa đơn vị: ${unitName}`, "i") });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog).toContainText("không còn dùng được để tạo quy đổi mới");
  await deleteDialog.getByRole("button", { name: "Hủy" }).click();
  await expect(deleteDialog).toHaveCount(0);

  await page.goto("/inventory/stock?section=counts");
  const submittedCount = page.locator(".entity-panel").filter({ hasText: "UAT-UXV2-KK-SUBMITTED" });
  await submittedCount.getByRole("button", { name: "Yêu cầu kiểm lại" }).click();
  await expect(submittedCount.getByLabel("Lý do yêu cầu kiểm lại")).toBeVisible();
  await submittedCount.getByRole("button", { name: "Hủy" }).click();
  await submittedCount.getByRole("button", { name: "Từ chối" }).click();
  await expect(submittedCount.getByLabel("Lý do từ chối")).toBeVisible();
  await submittedCount.getByRole("button", { name: "Hủy" }).click();
  const postedCount = page.locator(".entity-panel").filter({ hasText: "UAT-UXV2-KK-POSTED" });
  await postedCount.getByRole("button", { name: "Đảo phiếu" }).click();
  await expect(postedCount).toContainText("append-only");
  await expect(postedCount.getByLabel("Lý do đảo phiếu")).toBeVisible();
  await postedCount.getByRole("button", { name: "Hủy" }).click();

  await page.goto("/inventory/stock?section=exceptions");
  const negativePanel = page.locator(".negative-stock-override-panel");
  const negativeRecord = (page.viewportSize()?.width ?? 1440) <= 767
    ? negativePanel.locator("article.hx-data-card").filter({ hasText: "UAT-UXV2-YCAM-001" })
    : negativePanel.getByRole("row").filter({ hasText: "UAT-UXV2-YCAM-001" });
  await expect(negativeRecord).toBeVisible();
  await negativeRecord.getByRole("button", { name: "Từ chối" }).click();
  await expect(negativeRecord.getByLabel("Lý do từ chối")).toBeVisible();
  await negativeRecord.getByRole("button", { name: "Hủy" }).click();

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 && getComputedStyle(element).position !== "fixed";
      })
      .slice(0, 12)
      .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }))
  }));
  expect(overflow.documentWidth, JSON.stringify(overflow.offenders)).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  if (testInfo.project.name === "authenticated-1440") {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  }
});

test("delivery discrepancy approval, rejection affordance and receipt waiver work without F5", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "authenticated-1440", "Luồng mutation chỉ chạy một lần trên fixture cô lập.");
  await login(page, "WORKER");
  await page.goto("/delivery/jobs/uat-uxv2-delivery-job");
  await page.getByRole("button", { name: "Báo chênh lệch" }).click();
  await page.getByLabel("Lý do bắt buộc").fill("Khách chỉ nhận sáu bao trong chuyến này");
  await page.getByLabel(/số lượng đề nghị/i).fill("6");
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByText(/Đã báo chênh lệch chuyến/i)).toBeVisible();
  await expect(page.getByText("Đã báo chênh lệch, chờ duyệt", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\/|$)/);
  await login(page, "OWNER");
  await page.goto("/delivery/jobs/uat-uxv2-delivery-job");
  await expect(page.getByRole("button", { name: "Duyệt chênh lệch" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Từ chối chênh lệch" }).first().click();
  await expect(page.getByLabel("Lý do bắt buộc").first()).toBeVisible();
  await page.getByRole("button", { name: "Hủy" }).first().click();
  await page.getByRole("button", { name: "Duyệt chênh lệch" }).first().click();
  await expect(page.getByText(/Đã duyệt số lượng giao một phần/i)).toBeVisible();

  await expect(page.getByRole("button", { name: "Miễn ảnh khách nhận" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Miễn ảnh khách nhận" }).first().click();
  await page.getByLabel("Lý do bắt buộc").first().fill("Khách không có thiết bị chụp ảnh tại điểm giao");
  await page.getByRole("button", { name: "Xác nhận", exact: true }).first().click();
  await expect(page.getByText(/đã miễn ảnh xác nhận/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Miễn ảnh khách nhận" })).toHaveCount(0);
});
