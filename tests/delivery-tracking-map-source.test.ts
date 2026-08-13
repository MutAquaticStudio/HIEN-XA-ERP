import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readWorkspaceFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("delivery tracking map presentation", () => {
  it("loads the MapLibre stylesheet required for a visible map", () => {
    expect(readWorkspaceFile("src/app/globals.css")).toContain('@import "maplibre-gl/dist/maplibre-gl.css";');
  });

  it("shows an explicit map failure and empty tracking state", () => {
    const source = readWorkspaceFile("src/components/delivery-tracking-map.tsx");

    expect(source).toContain('map.on("error"');
    expect(source).toContain("trackingLoaded");
    expect(source).toContain("Chưa có vị trí trực tiếp");
  });
});
