type DirectoryEntry = { name: string; isDirectory: () => boolean };
type NodeFileSystem = {
  readFileSync: (path: string, encoding: "utf8") => string;
  readdirSync: (path: string, options: { withFileTypes: true }) => DirectoryEntry[];
};
type NodePath = {
  join: (...paths: string[]) => string;
  relative: (from: string, to: string) => string;
};

declare const process: { cwd: () => string };
declare const require: (moduleName: string) => unknown;

const { readFileSync, readdirSync } = require("node:fs") as NodeFileSystem;
const { join, relative } = require("node:path") as NodePath;

const mobileRoot = process.cwd();
const sourceRoots = ["app", "components", "lib"].map((directory) => join(mobileRoot, directory));

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

function mobilePath(path: string) {
  return relative(mobileRoot, path).replace(/\\/g, "/");
}

const allowedExternalNavigation = new Map<string, RegExp>([
  ["components/app-update-notice.tsx", /Linking\.openURL\(manifest\.downloadUrl\)/],
  ["components/native-assigned-delivery-map.tsx", /Linking\.openURL\(`geo:0,0\?q=/]
]);

describe("native-only mobile regression boundary", () => {
  it("does not declare the removed WebView dependency", () => {
    const mobilePackage = JSON.parse(readFileSync(join(mobileRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(mobilePackage.dependencies?.["react-native-webview"]).toBeUndefined();
    expect(mobilePackage.devDependencies?.["react-native-webview"]).toBeUndefined();
  });

  it("keeps ERP flows native and limits external navigation to explicit native handlers", () => {
    const forbiddenBoundaries: Array<[string, RegExp]> = [
      ["WebView package", /\breact-native-webview\b/],
      ["WebView component", /\bSecureErpWebView\b/],
      ["web bridge", /\bcreateWebBridge\b/],
      ["browser package", /\bexpo-web-browser\b/],
      ["browser API", /\b(?:openBrowserAsync|openAuthSessionAsync)\b/],
      ["browser global", /\bwindow\.(?:open|location)\b/],
      ["external router navigation", /\brouter\.(?:push|replace|navigate)\(\s*["'`]https?:/]
    ];

    for (const file of sourceRoots.flatMap(collectSourceFiles)) {
      const path = mobilePath(file);
      const source = readFileSync(file, "utf8");

      for (const [, pattern] of forbiddenBoundaries) {
        expect(source).not.toMatch(pattern);
      }

      const externalOpenCalls = source.match(/\bLinking\.openURL\s*\(/g) ?? [];
      if (externalOpenCalls.length === 0) continue;

      const allowedPattern = allowedExternalNavigation.get(path);
      expect(allowedPattern).toBeDefined();
      expect(externalOpenCalls).toHaveLength(1);
      expect(source).toMatch(allowedPattern!);
    }
  });
});
