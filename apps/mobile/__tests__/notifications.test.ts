jest.mock("expo-constants", () => ({ __esModule: true, default: { easConfig: { projectId: "project-id" } } }));
jest.mock("expo-device", () => ({ __esModule: true, default: { isDevice: true } }));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[test]" })),
  AndroidImportance: { HIGH: 4 }
}));
jest.mock("../lib/native-push-api", () => ({
  NativePushApiError: class NativePushApiError extends Error {
    status?: number;
    constructor(message: string, code?: number) { super(message); this.status = code; }
  },
  registerNativePushSubscription: jest.fn(),
  removeNativePushSubscription: jest.fn()
}));

import * as SecureStore from "expo-secure-store";
import { NativePushApiError, removeNativePushSubscription } from "../lib/native-push-api";
import { disableMobilePushNotifications, getMobilePushNotificationState } from "../lib/notifications";

describe("native push toggle", () => {
  let storedRegistration: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    storedRegistration = JSON.stringify({ token: "ExponentPushToken[test]", state: "active" });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => storedRegistration);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key: string, value: string) => { storedRegistration = value; });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => { storedRegistration = undefined; });
  });

  it("removes the server subscription and local token when the user turns push off", async () => {
    (removeNativePushSubscription as jest.Mock).mockResolvedValue({ ok: true, removed: true });

    const result = await disableMobilePushNotifications("session-token");

    expect(result.disabled).toBe(true);
    expect(removeNativePushSubscription).toHaveBeenCalledWith("session-token", "ExponentPushToken[test]");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("vlxd.mobile.push-token.v1");
  });

  it("marks a failed non-auth unsubscribe for explicit retry instead of pretending it succeeded", async () => {
    (removeNativePushSubscription as jest.Mock).mockRejectedValue(new Error("Mất mạng"));

    const result = await disableMobilePushNotifications("session-token");

    expect(result.disabled).toBe(false);
    expect(result.state.removalPending).toBe(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("vlxd.mobile.push-token.v1", expect.stringContaining("pending-removal"));
  });

  it("surfaces an unauthorized unsubscribe so the session boundary can clean up", async () => {
    (removeNativePushSubscription as jest.Mock).mockRejectedValue(new NativePushApiError("Phiên đã hết hạn", 401));

    await expect(disableMobilePushNotifications("session-token")).rejects.toMatchObject({ status: 401 });
    expect((await getMobilePushNotificationState()).registered).toBe(true);
  });
});
