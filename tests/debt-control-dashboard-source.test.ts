import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const debtControlView = readFileSync(join(process.cwd(), "src", "components", "operations", "receivables-view.tsx"), "utf8");
const payablesView = readFileSync(join(process.cwd(), "src", "components", "operations", "payables-view.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src", "app", "elder-friendly-ui.css"), "utf8");

describe("debt control dashboard", () => {
  it("uses ledger-derived debt summaries for both customer and supplier tracking", () => {
    expect(debtControlView).toContain("function DebtControlBoard");
    expect(debtControlView).toContain("summaries={filteredSummaries}");
    expect(debtControlView).toContain("obligations={filteredObligations}");
    expect(debtControlView).toContain("onChooseParty={setCustomerId}");
    expect(payablesView).toContain("onChooseParty={setSupplierId}");
  });

  it("prioritizes open documents by posting date without claiming an unavailable due date", () => {
    expect(debtControlView).toContain("left.postingDate.localeCompare(right.postingDate)");
    expect(debtControlView).toContain("chứng từ chưa có hạn thanh toán");
    expect(styles).toContain(".debt-control-metrics");
    expect(styles).toContain("@media (max-width: 820px)");
  });
});
