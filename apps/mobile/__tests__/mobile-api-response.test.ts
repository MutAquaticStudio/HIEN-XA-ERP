import { getMobileManagementOverview, MobileApiError } from "../lib/api";

describe("mobile API response boundary", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ERP_URL = "https://erp.example.test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("turns an HTML 404 response into a safe business error instead of parsing it as JSON", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "<!doctype html><html><body>Not found</body></html>"
    } as Response);

    await expect(getMobileManagementOverview("test-token")).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        name: "MobileApiError",
        status: 404,
        message: "Máy chủ chưa được cập nhật đầy đủ cho ứng dụng. Vui lòng thử lại sau ít phút."
      })
    );
  });

  it("returns a safe network error when the request cannot reach the server", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("network failed"));

    await expect(getMobileManagementOverview("test-token")).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        name: "MobileApiError",
        status: 0,
        message: "Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại."
      })
    );
  });
});
