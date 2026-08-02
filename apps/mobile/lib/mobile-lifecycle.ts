type ForegroundRefresher = () => Promise<void> | void;

const refreshers = new Set<ForegroundRefresher>();
let activeRefresh: Promise<void> | undefined;

export function registerMobileForegroundRefresh(refresher: ForegroundRefresher) {
  refreshers.add(refresher);
  return () => { refreshers.delete(refresher); };
}

export async function refreshMobileForegroundData() {
  if (!activeRefresh) {
    activeRefresh = Promise.allSettled([...refreshers].map((refresher) => Promise.resolve(refresher())))
      .then(() => undefined)
      .finally(() => { activeRefresh = undefined; });
  }
  await activeRefresh;
}
