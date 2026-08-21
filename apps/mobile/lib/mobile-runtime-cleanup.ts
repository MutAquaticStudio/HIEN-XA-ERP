import { stopBackgroundTracking } from "./location-task";
import { clearMobilePushRegistration } from "./notifications";
import { clearMobileSession, getMobileSession } from "./session";

export async function endMobileSession(accessToken?: string) {
  const session = accessToken ? undefined : await getMobileSession();
  const token = accessToken ?? session?.accessToken;
  try {
    await Promise.allSettled([
      stopBackgroundTracking(),
      clearMobilePushRegistration(token)
    ]);
  } finally {
    await clearMobileSession();
  }
}
