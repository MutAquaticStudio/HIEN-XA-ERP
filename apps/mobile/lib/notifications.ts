import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { NativePushApiError, registerNativePushSubscription, removeNativePushSubscription } from "./native-push-api";

const pushTokenKey = "vlxd.mobile.push-token.v1";
type PushRegistration = { token: string; state: "active" | "pending-removal" };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export type MobilePushNotificationState = {
  registered: boolean;
  permissionGranted: boolean;
  removalPending: boolean;
};

async function readPushRegistration(): Promise<PushRegistration | undefined> {
  const raw = await SecureStore.getItemAsync(pushTokenKey);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<PushRegistration>;
    if (typeof parsed.token === "string" && (parsed.state === "active" || parsed.state === "pending-removal")) return parsed as PushRegistration;
  } catch {
    return { token: raw, state: "active" };
  }
  await SecureStore.deleteItemAsync(pushTokenKey);
  return undefined;
}

async function writePushRegistration(registration: PushRegistration) {
  await SecureStore.setItemAsync(pushTokenKey, JSON.stringify(registration));
}

export async function getMobilePushNotificationState(): Promise<MobilePushNotificationState> {
  const [permission, registration] = await Promise.all([
    Notifications.getPermissionsAsync(),
    readPushRegistration()
  ]);
  return {
    registered: registration?.state === "active",
    permissionGranted: permission.status === "granted",
    removalPending: registration?.state === "pending-removal"
  };
}

export async function enableMobilePushNotifications(accessToken: string) {
  if (!Device.isDevice) {
    return { enabled: false, message: "Thông báo đẩy cần được thử trên điện thoại thật hoặc bản development build.", state: await getMobilePushNotificationState() };
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("operations", {
      name: "Cập nhật công việc",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      sound: "default"
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.status === "granted" ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") {
    return { enabled: false, message: "Bạn chưa cho phép nhận thông báo. Có thể bật lại trong phần cài đặt điện thoại.", state: await getMobilePushNotificationState() };
  }
  const projectId = Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    return { enabled: false, message: "Ứng dụng chưa có EAS Project ID để gửi thông báo. Cần cấu hình trước khi phát hành bản mobile.", state: await getMobilePushNotificationState() };
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerNativePushSubscription(accessToken, token);
  await writePushRegistration({ token, state: "active" });
  return { enabled: true, message: "Thiết bị này đã sẵn sàng nhận cập nhật công việc và giao hàng.", state: await getMobilePushNotificationState() };
}

export async function disableMobilePushNotifications(accessToken: string) {
  const registration = await readPushRegistration();
  if (!registration) return { disabled: true, message: "Thiết bị này chưa đăng ký nhận thông báo.", state: await getMobilePushNotificationState() };
  try {
    await removeNativePushSubscription(accessToken, registration.token);
    await SecureStore.deleteItemAsync(pushTokenKey);
    return { disabled: true, message: "Đã tắt thông báo cho thiết bị này.", state: await getMobilePushNotificationState() };
  } catch (cause) {
    if (cause instanceof NativePushApiError && cause.status === 401) throw cause;
    await writePushRegistration({ token: registration.token, state: "pending-removal" });
    return {
      disabled: false,
      message: cause instanceof Error ? `${cause.message} Hệ thống sẽ thử tắt lại khi bạn bấm lại.` : "Chưa thể tắt thông báo. Vui lòng thử lại khi có mạng.",
      state: await getMobilePushNotificationState()
    };
  }
}

export async function clearMobilePushRegistration(accessToken?: string) {
  const registration = await readPushRegistration();
  try {
    if (registration && accessToken) await removeNativePushSubscription(accessToken, registration.token);
  } finally {
    await SecureStore.deleteItemAsync(pushTokenKey);
  }
}
