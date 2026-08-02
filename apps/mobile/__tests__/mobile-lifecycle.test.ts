import { refreshMobileForegroundData, registerMobileForegroundRefresh } from "../lib/mobile-lifecycle";

describe("mobile foreground lifecycle", () => {
  it("does not run duplicate foreground refresh cycles", async () => {
    let release: (() => void) | undefined;
    const refresher = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const unregister = registerMobileForegroundRefresh(refresher);

    const first = refreshMobileForegroundData();
    const second = refreshMobileForegroundData();
    expect(refresher).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    unregister();
  });
});
