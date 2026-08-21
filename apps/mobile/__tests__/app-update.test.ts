import { compareMobileVersions, mobileUpdateStatus } from "../lib/app-update";

describe("mobile release policy", () => {
  it("compares semantic mobile versions without lexical mistakes", () => {
    expect(compareMobileVersions("1.0.10", "1.0.2")).toBe(1);
    expect(compareMobileVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareMobileVersions("1.0.0", "1.1.0")).toBe(-1);
  });

  it("marks only unsupported builds as required", () => {
    expect(mobileUpdateStatus("1.0.0", "1.0.1", "1.0.0")).toBe("optional");
    expect(mobileUpdateStatus("1.0.0", "1.0.1", "1.0.1")).toBe("required");
    expect(mobileUpdateStatus("1.0.1", "1.0.1", "1.0.1")).toBe("current");
  });
});
