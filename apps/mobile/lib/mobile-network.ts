import NetInfo from "@react-native-community/netinfo";

export class MobileOfflineError extends Error {
  constructor() {
    super("Bạn đang ngoại tuyến. Không thể gửi thao tác này khi chưa có mạng.");
    this.name = "MobileOfflineError";
  }
}

export async function requireMobileNetworkForMutation() {
  const state = await NetInfo.fetch();
  if (state.isConnected === false || state.isInternetReachable === false) {
    throw new MobileOfflineError();
  }
}
