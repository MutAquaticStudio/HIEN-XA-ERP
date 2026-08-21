type MobileUnauthorizedHandler = () => Promise<void> | void;

let handler: MobileUnauthorizedHandler | undefined;
let activeCleanup: Promise<void> | undefined;

export function registerMobileUnauthorizedHandler(nextHandler: MobileUnauthorizedHandler) {
  handler = nextHandler;
  return () => {
    if (handler === nextHandler) handler = undefined;
  };
}

export async function handleMobileUnauthorizedResponse() {
  if (!handler) return;
  if (!activeCleanup) {
    activeCleanup = Promise.resolve(handler()).catch(() => undefined).finally(() => {
      activeCleanup = undefined;
    });
  }
  await activeCleanup;
}
