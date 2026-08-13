import { describe, expect, it } from "vitest";
import { buildFeedbackRedirect } from "../src/server/identity/feedback-query";

describe("authentication feedback query encoding", () => {
  it("round-trips Vietnamese exactly once", () => {
    const message = "Đã khôi phục tài khoản chủ thành công. Vui lòng đăng nhập bằng thông tin mới.";
    const redirect = buildFeedbackRedirect("/login", "message", message);
    const parsed = new URL(redirect, "https://app.hienxavlxd.com");
    expect(parsed.searchParams.get("message")).toBe(message);
    expect(parsed.searchParams.get("message")).not.toMatch(/[ÃÄ]/);
  });

  it("keeps partner return paths separate", () => {
    const redirect = buildFeedbackRedirect("/khach-hang/dang-nhap", "error", "Tên đăng nhập/email hoặc mật khẩu không đúng.", { returnTo: "/khach-hang" });
    const parsed = new URL(redirect, "https://app.hienxavlxd.com");
    expect(parsed.searchParams.get("error")).toBe("Tên đăng nhập/email hoặc mật khẩu không đúng.");
    expect(parsed.searchParams.get("returnTo")).toBe("/khach-hang");
  });
});
