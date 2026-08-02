type NodeFileSystem = {
  readFileSync: (path: string, encoding: "utf8") => string;
};
type NodePath = {
  join: (...paths: string[]) => string;
};

declare const process: { cwd: () => string };
declare const require: (moduleName: string) => unknown;

const { readFileSync } = require("node:fs") as NodeFileSystem;
const { join } = require("node:path") as NodePath;
const mobileRoot = process.cwd();

type ExpoConfig = {
  expo?: {
    version?: string;
    android?: {
      package?: string;
      permissions?: string[];
      blockedPermissions?: string[];
    };
  };
};

type EasConfig = {
  build?: Record<string, {
    distribution?: string;
    android?: { buildType?: string };
    env?: Record<string, string>;
  }>;
};

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(mobileRoot, filename), "utf8")) as T;
}

describe("Android release configuration", () => {
  it("keeps app.json as the versioned Android source and blocks unused microphone access", () => {
    const config = readJson<ExpoConfig>("app.json");
    const android = config.expo?.android;

    expect(config.expo?.version).toBe("1.0.3");
    expect(android?.package).toBe("vn.vlxd.operations");
    expect(android?.permissions).toEqual(expect.arrayContaining([
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_LOCATION",
      "android.permission.POST_NOTIFICATIONS"
    ]));
    expect(android?.permissions).not.toContain("android.permission.RECORD_AUDIO");
    expect(android?.blockedPermissions).toContain("android.permission.RECORD_AUDIO");
  });

  it("keeps the internal release as an HTTPS APK distribution", () => {
    const config = readJson<EasConfig>("eas.json");
    const internal = config.build?.internal;

    expect(internal?.distribution).toBe("internal");
    expect(internal?.android?.buildType).toBe("apk");
    expect(internal?.env?.EXPO_PUBLIC_ERP_URL).toBe("https://vlxd-hien-xa.vercel.app");
  });
});
