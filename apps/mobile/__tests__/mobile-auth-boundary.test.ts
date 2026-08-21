import { handleMobileUnauthorizedResponse, registerMobileUnauthorizedHandler } from "../lib/mobile-auth-boundary";

describe("mobile unauthorized boundary", () => {
  it("coalesces concurrent 401 cleanup into one device cleanup", async () => {
    let release: (() => void) | undefined;
    const handler = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const unregister = registerMobileUnauthorizedHandler(handler);

    const first = handleMobileUnauthorizedResponse();
    const second = handleMobileUnauthorizedResponse();
    expect(handler).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    unregister();
  });
});
