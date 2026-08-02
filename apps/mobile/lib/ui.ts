import { Platform, useColorScheme } from "react-native";

export type AppTheme = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceStrong: string;
  text: string;
  textMuted: string;
  border: string;
  brand: string;
  brandPressed: string;
  brandSoft: string;
  danger: string;
  dangerSoft: string;
  focus: string;
  tabBar: string;
};

const lightTheme: AppTheme = {
  background: "#F1F5F9",
  surface: "#FFFFFF",
  surfaceMuted: "#E2E8F0",
  surfaceStrong: "#102344",
  text: "#0F172A",
  textMuted: "#475569",
  border: "#CBD5E1",
  brand: "#1D4ED8",
  brandPressed: "#18355F",
  brandSoft: "#DBEAFE",
  danger: "#B91C1C",
  dangerSoft: "#FEE2E2",
  focus: "#2563EB",
  tabBar: "#FFFFFF"
};

const darkTheme: AppTheme = {
  background: "#071225",
  surface: "#102344",
  surfaceMuted: "#18355F",
  surfaceStrong: "#EFF6FF",
  text: "#F8FAFC",
  textMuted: "#CBD5E1",
  border: "#334E78",
  brand: "#93C5FD",
  brandPressed: "#BFDBFE",
  brandSoft: "#1E3A5F",
  danger: "#FCA5A5",
  dangerSoft: "#4C1D24",
  focus: "#93C5FD",
  tabBar: "#0A1730"
};

export function useAppTheme(): AppTheme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

export const mobilePlatform = {
  isIos: Platform.OS === "ios",
  tabBarHeight: Platform.OS === "ios" ? 90 : 76,
  tabBarBottomPadding: Platform.OS === "ios" ? 7 : 8
};

export const mobileFonts = {
  regular: "BeVietnamPro_400Regular",
  medium: "BeVietnamPro_500Medium",
  semibold: "BeVietnamPro_600SemiBold",
  bold: "BeVietnamPro_700Bold"
} as const;
