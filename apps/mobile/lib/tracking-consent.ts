import * as SecureStore from "expo-secure-store";
import { nativeTrackingConsentPolicyVersion } from "./tracking-consent-policy";

const consentKey = "vlxd.mobile.tracking.consent.v1";

export type NativeTrackingConsent = {
  policyVersion: typeof nativeTrackingConsentPolicyVersion;
  sessionId: string;
  deliveryJobId: string;
  acceptedAt: string;
};

export async function recordNativeTrackingConsent(sessionId: string, deliveryJobId: string, acceptedAt = new Date().toISOString()): Promise<NativeTrackingConsent> {
  const consent: NativeTrackingConsent = {
    policyVersion: nativeTrackingConsentPolicyVersion,
    sessionId,
    deliveryJobId,
    acceptedAt
  };
  await SecureStore.setItemAsync(consentKey, JSON.stringify(consent));
  return consent;
}

export async function clearNativeTrackingConsent() {
  await SecureStore.deleteItemAsync(consentKey);
}
