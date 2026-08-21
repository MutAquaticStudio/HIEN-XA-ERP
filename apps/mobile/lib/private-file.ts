import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { MobileSession } from "./session";
import { resolveMobileApiPath } from "./api-url";
import { requireMobileNetworkForMutation } from "./mobile-network";

export type PrivateFileDownload = {
  path: string;
  filename: string;
  mimeType?: string;
};

export function safeMobileFilename(filename: string) {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return normalized || "tep-rieng";
}

export function privateFileRequest(session: MobileSession, path: string) {
  return {
    url: resolveMobileApiPath(path),
    headers: { Authorization: `Bearer ${session.accessToken}` }
  };
}

export async function downloadAndSharePrivateFile(session: MobileSession, input: PrivateFileDownload) {
  await requireMobileNetworkForMutation();
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("Không thể chuẩn bị thư mục tạm để tải tệp.");
  const request = privateFileRequest(session, input.path);
  const fileUri = `${cacheDirectory}${Date.now()}-${safeMobileFilename(input.filename)}`;
  const result = await FileSystem.downloadAsync(request.url, fileUri, { headers: request.headers });
  if (result.status < 200 || result.status >= 300) {
    throw new Error("Không thể tải tệp riêng tư. Vui lòng thử lại.");
  }
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) await Sharing.shareAsync(result.uri, { mimeType: input.mimeType, dialogTitle: "Mở hoặc chia sẻ tệp" });
  return { uri: result.uri, shared: canShare };
}
