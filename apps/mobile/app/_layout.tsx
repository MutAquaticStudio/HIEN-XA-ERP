import "../lib/location-task";
import { useEffect, useRef } from "react";
import { AppState, BackHandler, Platform, type AppStateStatus } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts
} from "@expo-google-fonts/be-vietnam-pro";
import { AppUpdateNotice } from "../components/app-update-notice";
import { registerMobileUnauthorizedHandler } from "../lib/mobile-auth-boundary";
import { refreshMobileForegroundData } from "../lib/mobile-lifecycle";
import { endMobileSession } from "../lib/mobile-runtime-cleanup";

void SplashScreen.preventAutoHideAsync();

function MobileRuntimeBoundary() {
  const pathname = usePathname();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => registerMobileUnauthorizedHandler(async () => {
    await endMobileSession();
    router.replace("/");
  }), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasInactive = appState.current === "inactive" || appState.current === "background";
      appState.current = nextState;
      if (wasInactive && nextState === "active") void refreshMobileForegroundData();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pathname.endsWith("/operations") || pathname === "/") return false;
      router.replace("/(tabs)/operations");
      return true;
    });
    return () => subscription.remove();
  }, [pathname]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <MobileRuntimeBoundary />
      <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#f1f5f9" } }} />
      <AppUpdateNotice />
    </SafeAreaProvider>
  );
}
