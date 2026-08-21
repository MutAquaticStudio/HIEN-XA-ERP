jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: jest.fn()
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn()
}));

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { downloadAndSharePrivateFile, privateFileRequest, safeMobileFilename } from "../lib/private-file";

describe("private mobile file adapter", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_ERP_URL = "https://erp.example.test";
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200, uri: "file:///cache/report.pdf" });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  });

  it("downloads private files with the current Bearer token before native sharing", async () => {
    const session = { accessToken: "native-token", user: { id: "u1", displayName: "Người dùng", role: "owner", moduleIds: [] } };
    await downloadAndSharePrivateFile(session, { path: "/api/mobile/reporting/download?id=r1", filename: "Báo cáo tháng.pdf", mimeType: "application/pdf" });

    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      "https://erp.example.test/api/mobile/reporting/download?id=r1",
      expect.stringContaining("B-o-c-o-th-ng.pdf"),
      { headers: { Authorization: "Bearer native-token" } }
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/report.pdf", expect.objectContaining({ mimeType: "application/pdf" }));
  });

  it("does not permit absolute external download URLs", () => {
    const session = { accessToken: "native-token", user: { id: "u1", displayName: "Người dùng", role: "owner", moduleIds: [] } };
    expect(() => privateFileRequest(session, "https://attacker.example/file")).toThrow(/Đường dẫn/);
    expect(safeMobileFilename("  báo cáo / tháng.pdf ")).toBe("b-o-c-o-th-ng.pdf");
  });
});
