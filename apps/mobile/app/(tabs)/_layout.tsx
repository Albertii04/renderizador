import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { c } from "../../src/theme";

// NOTE: Real native UITabBar with iOS 26 liquid glass requires react-native-bottom-tabs
// in a development build. Expo Go can't load native RNCTabView.
// This fallback uses expo-blur for a glassy look that works in Expo Go.

function TabBarBackground() {
  if (Platform.OS === "ios") {
    return <BlurView tint="systemUltraThinMaterialDark" intensity={80} style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface }]} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
            borderTopWidth: 0,
            backgroundColor: "transparent",
            elevation: 0,
            height: 84,
          },
          android: {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 6,
          },
        }),
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarItemStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="stations" options={{ title: "Estaciones", tabBarIcon: ({ color, size }) => <Ionicons name="desktop-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="reservations" options={{ title: "Reservas", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
