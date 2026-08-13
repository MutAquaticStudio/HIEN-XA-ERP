import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const loginPage = readFileSync(join(process.cwd(), "src", "app", "login", "page.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src", "app", "elder-friendly-ui.css"), "utf8");

describe("portal login choices", () => {
  it("gives customers and suppliers a direct route to their own authenticated portals", () => {
    expect(loginPage).toContain('href="/khach-hang/dang-nhap"');
    expect(loginPage).toContain('href="/nha-cung-cap/dang-nhap"');
    expect(loginPage).toContain("auth-portal-options");
  });

  it("keeps both role choices readable and usable on a narrow screen", () => {
    expect(styles).toContain(".auth-portal-option-grid");
    expect(styles).toContain("min-height: 96px");
    expect(styles).toContain("grid-template-columns: 1fr");
  });
});
