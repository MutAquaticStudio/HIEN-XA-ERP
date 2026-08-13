import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["src", "scripts"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".ps1"]);
const intentionalLegacyReaders = new Set([
  "src/components/operations/audit-view.tsx"
]);
const mojibake = /(?:\u00c3[\u0080-\u00bf]|\u00c4[\u0080-\u00bf]|\u00c6[\u0080-\u00bf]|\ufffd)/u;

describe("UTF-8 source contract", () => {
  it("keeps runtime source and fixture text free of double-encoded Vietnamese", () => {
    const failures: string[] = [];
    for (const file of roots.flatMap(walk)) {
      const normalized = file.replaceAll("\\", "/");
      if (intentionalLegacyReaders.has(normalized)) continue;
      const text = readFileSync(file, "utf8");
      if (mojibake.test(text)) failures.push(normalized);
    }
    expect(failures).toEqual([]);
  });
});

function walk(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const file = join(root, name);
    if (statSync(file).isDirectory()) return walk(file);
    const extension = file.slice(file.lastIndexOf("."));
    return extensions.has(extension) ? [relative(process.cwd(), file)] : [];
  });
}
