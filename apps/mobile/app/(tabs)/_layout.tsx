import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, type ColorValue } from "react-native";
import { mobileFonts, mobilePlatform, useAppTheme } from "../../lib/ui";
import { getMobileSession } from "../../lib/session";
import { canShowTrackingTab } from "../../lib/tracking-view-policy";
import { getRoleTabLabels } from "../../lib/role-navigation";

export default function AppTabs() {
  const theme = useAppTheme();
  const [role, setRole] = useState<string>();

  useEffect(() => { void getMobileSession().then((session) => setRole(session?.user.role)); }, []);
  const customerOrSupplier = role === "customer" || role === "supplier";
  const trackingRole = canShowTrackingTab(role);
  const labels = getRoleTabLabels(role);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerShadowVisible: false,
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontFamily: mobileFonts.bold, fontSize: 18 },
        sceneStyle: { backgroundColor: theme.background },
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { minHeight: 48, paddingTop: 3 },
        tabBarLabelStyle: { fontFamily: mobileFonts.semibold, fontSize: 16, marginTop: 0 },
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          height: mobilePlatform.tabBarHeight,
          paddingBottom: mobilePlatform.tabBarBottomPadding,
          paddingTop: 6
        }
      }}
    >
      <Tabs.Screen name="operations" options={{ title: labels.operations, tabBarIcon: ({ color, size, focused }) => <TabIcon name="operations" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="tracking" options={{ href: role ? (trackingRole ? undefined : null) : undefined, title: labels.tracking, tabBarIcon: ({ color, size, focused }) => <TabIcon name="tracking" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="messages" options={{ href: role ? (customerOrSupplier ? undefined : null) : undefined, title: labels.messages, tabBarIcon: ({ color, size, focused }) => <TabIcon name="messages" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="account" options={{ title: labels.account, tabBarIcon: ({ color, size, focused }) => <TabIcon name="account" color={color} size={size} focused={focused} /> }} />
    </Tabs>
  );
}

function TabIcon({ name, color, size, focused }: { name: "operations" | "tracking" | "messages" | "account"; color: ColorValue; size: number; focused: boolean }) {
  const iconColor = color as string;
  if (Platform.OS === "ios") {
    if (name === "operations") return <Ionicons color={iconColor} name={focused ? "briefcase" : "briefcase-outline"} size={size} />;
    if (name === "tracking") return <Ionicons color={iconColor} name={focused ? "navigate" : "navigate-outline"} size={size} />;
    if (name === "messages") return <Ionicons color={iconColor} name={focused ? "chatbubble" : "chatbubble-outline"} size={size} />;
    return <Ionicons color={iconColor} name={focused ? "person-circle" : "person-circle-outline"} size={size} />;
  }

  if (name === "operations") return <MaterialCommunityIcons color={iconColor} name={focused ? "clipboard-text" : "clipboard-text-outline"} size={size} />;
  if (name === "tracking") return <MaterialCommunityIcons color={iconColor} name={focused ? "map-marker-radius" : "map-marker-radius-outline"} size={size} />;
  if (name === "messages") return <MaterialCommunityIcons color={iconColor} name={focused ? "chat" : "chat-outline"} size={size} />;
  return <MaterialCommunityIcons color={iconColor} name={focused ? "account-circle" : "account-circle-outline"} size={size} />;
}
