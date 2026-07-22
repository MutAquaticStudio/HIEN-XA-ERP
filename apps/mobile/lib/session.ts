import * as SecureStore from "expo-secure-store";

const sessionKey = "vlxd.mobile.session.v1";

export type MobileSession = {
  accessToken: string;
  user: { id: string; displayName: string; role: string; moduleIds: string[] };
};

export async function getMobileSession(): Promise<MobileSession | undefined> {
  const raw = await SecureStore.getItemAsync(sessionKey);
  if (!raw) return undefined;
  try { return JSON.parse(raw) as MobileSession; } catch { await SecureStore.deleteItemAsync(sessionKey); return undefined; }
}

export async function saveMobileSession(session: MobileSession) {
  await SecureStore.setItemAsync(sessionKey, JSON.stringify(session));
}

export async function clearMobileSession() {
  await SecureStore.deleteItemAsync(sessionKey);
}
