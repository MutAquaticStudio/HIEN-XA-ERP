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
  background: "#F3F6F1",
  surface: "#FCFDFC",
  surfaceMuted: "#E8EFE7",
  surfaceStrong: "#183A2A",
  text: "#183128",
  textMuted: "#5E7165",
  border: "#CFDCD0",
  brand: "#146C43",
  brandPressed: "#0C5735",
  brandSoft: "#DCEEDF",
  danger: "#A93224",
  dangerSoft: "#F9E4DF",
  focus: "#1C8253",
  tabBar: "#FAFCF9"
};

const darkTheme: AppTheme = {
  background: "#102219",
  surface: "#172C21",
  surfaceMuted: "#20382A",
  surfaceStrong: "#D7F1DA",
  text: "#EDF7EF",
  textMuted: "#B7C8B9",
  border: "#36503E",
  brand: "#82C894",
  brandPressed: "#A4DEB0",
  brandSoft: "#254A33",
  danger: "#FFB4A8",
  dangerSoft: "#51342E",
  focus: "#A4DEB0",
  tabBar: "#14271C"
};

export function useAppTheme(): AppTheme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

export const mobilePlatform = {
  isIos: Platform.OS === "ios",
  tabBarHeight: Platform.OS === "ios" ? 82 : 68,
  tabBarBottomPadding: Platform.OS === "ios" ? 7 : 8
};
