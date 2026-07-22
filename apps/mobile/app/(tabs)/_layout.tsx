import { Tabs } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, type ColorValue } from "react-native";
import { mobilePlatform, useAppTheme } from "../../lib/ui";

export default function AppTabs() {
  const theme = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerShadowVisible: false,
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontSize: 17, fontWeight: "800" },
        sceneStyle: { backgroundColor: theme.background },
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { paddingTop: 3 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "800", marginTop: 0 },
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          height: mobilePlatform.tabBarHeight,
          paddingBottom: mobilePlatform.tabBarBottomPadding,
          paddingTop: 6
        }
      }}
    >
      <Tabs.Screen name="operations" options={{ title: "Nghiệp vụ", tabBarIcon: ({ color, size, focused }) => <TabIcon name="operations" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="tracking" options={{ title: "Giao hàng", tabBarIcon: ({ color, size, focused }) => <TabIcon name="tracking" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="account" options={{ title: "Tài khoản", tabBarIcon: ({ color, size, focused }) => <TabIcon name="account" color={color} size={size} focused={focused} /> }} />
    </Tabs>
  );
}

function TabIcon({ name, color, size, focused }: { name: "operations" | "tracking" | "account"; color: ColorValue; size: number; focused: boolean }) {
  const iconColor = color as string;
  if (Platform.OS === "ios") {
    if (name === "operations") return <Ionicons color={iconColor} name={focused ? "briefcase" : "briefcase-outline"} size={size} />;
    if (name === "tracking") return <Ionicons color={iconColor} name={focused ? "navigate" : "navigate-outline"} size={size} />;
    return <Ionicons color={iconColor} name={focused ? "person-circle" : "person-circle-outline"} size={size} />;
  }

  if (name === "operations") return <MaterialCommunityIcons color={iconColor} name={focused ? "clipboard-text" : "clipboard-text-outline"} size={size} />;
  if (name === "tracking") return <MaterialCommunityIcons color={iconColor} name={focused ? "map-marker-radius" : "map-marker-radius-outline"} size={size} />;
  return <MaterialCommunityIcons color={iconColor} name={focused ? "account-circle" : "account-circle-outline"} size={size} />;
}
