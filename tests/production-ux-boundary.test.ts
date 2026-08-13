import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production UX V2 boundaries", () => {
  it("self-hosts Vietnamese font and installs localized app boundaries", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const error = readFileSync("src/app/error.tsx", "utf8");
    const notFound = readFileSync("src/app/not-found.tsx", "utf8");
    expect(layout).toContain("@fontsource/be-vietnam-pro");
    expect(layout).toContain("skip-link");
    expect(error).toContain("Mã đối chiếu");
    expect(notFound).toContain("Không tìm thấy trang");
  });

  it("keeps only a non-financial cart and resumes ordering after customer login", () => {
    const preview = readFileSync("src/components/customer-order-preview.tsx", "utf8");
    const auth = readFileSync("src/app/auth-actions.ts", "utf8");
    expect(preview).toContain("hien-xa-customer-cart-v2");
    expect(preview).not.toContain('localStorage.setItem("deliveryAddress"');
    expect(auth).toContain('returnTo === "/dat-hang"');
  });

  it("does not render fixed push or text-size overlays from root layout", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const page = readFileSync("src/app/page.tsx", "utf8");
    expect(layout).not.toContain("<DisplayPreferences");
    expect(page).toContain("accountTools");
  });
});
