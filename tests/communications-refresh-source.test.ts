import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const partnerConversation = readFileSync(
  join(process.cwd(), "src", "components", "partner-conversation.tsx"),
  "utf8",
);

describe("partner conversation refresh", () => {
  it("refreshes the active conversation without disrupting the existing message view", () => {
    expect(partnerConversation).toContain("window.setInterval");
    expect(partnerConversation).toContain("load({ silent: true })");
    expect(partnerConversation).toContain("10_000");
    expect(partnerConversation).toContain("window.clearInterval(refreshTimer)");
    expect(partnerConversation).toContain("if (!silent) setLoading(true)");
  });

  it("keeps a newly sent message from being replaced by an older refresh response", () => {
    expect(partnerConversation).toContain("const loadSequence = useRef(0)");
    expect(partnerConversation).toContain("sequence === loadSequence.current");
    expect(partnerConversation).toContain("void load({ silent: true });");
  });
});
