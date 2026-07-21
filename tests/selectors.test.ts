import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { productLabel } from "../src/modules/operations/selectors";

describe("operations selectors", () => {
  it("shows product code, product name, and unit in product labels", () => {
    const state = createInitialOperationsState();

    expect(productLabel(state, "pu-cement-bag")).toBe("XM-HOLCIM-BAO · Xi măng Holcim (bao)");
    expect(productLabel(state, "missing-product")).toBe("missing-product");
  });
});
