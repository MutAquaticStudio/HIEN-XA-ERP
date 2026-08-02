import NetInfo from "@react-native-community/netinfo";
import { nativeErpGet, nativeErpPost } from "../lib/native-erp-api";
import { registerMobileUnauthorizedHandler } from "../lib/mobile-auth-boundary";

const session = { accessToken: "native-token", user: { id: "u1", displayName: "Người dùng", role: "owner", moduleIds: [] } };

describe("native ERP request boundary", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ERP_URL = "https://erp.example.test";
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true, isInternetReachable: true });
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  it("does not post a financial mutation while the device is offline", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false, isInternetReachable: false });
    globalThis.fetch = jest.fn();

    await expect(nativeErpPost(session, "/api/mobile/cash", { action: "confirmVoucher" })).rejects.toMatchObject({ name: "MobileOfflineError" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("cleans up the device boundary once when a native API returns 401", async () => {
    const cleanup = jest.fn();
    const unregister = registerMobileUnauthorizedHandler(cleanup);
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => JSON.stringify({ ok: false, error: "Phiên đã hết hạn" }) } as Response);

    await expect(nativeErpGet(session, "/api/mobile/catalog")).rejects.toMatchObject({ status: 401 });
    expect(cleanup).toHaveBeenCalledTimes(1);
    unregister();
  });
});
