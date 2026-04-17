import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { AppProvider } from "../src/providers/app-provider";
import { c } from "../src/theme";

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.white,
          headerShadowVisible: false,
          headerBackTitle: "Atrás",
          headerLargeTitle: true,
          headerLargeTitleStyle: { color: c.white },
          contentStyle: { backgroundColor: c.bg },
          headerBlurEffect: "dark",
          headerTransparent: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="stations/[id]" options={{ title: "Estación", headerLargeTitle: false }} />
        <Stack.Screen
          name="reservations/create"
          options={Platform.select({
            ios: {
              title: "Nueva reserva",
              presentation: "modal",
              headerLargeTitle: false,
            },
            default: {
              title: "Nueva reserva",
              presentation: "card",
              headerLargeTitle: false,
            },
          })}
        />
        <Stack.Screen
          name="onboarding"
          options={Platform.select({
            ios: {
              title: "Dar de alta empresa",
              presentation: "formSheet",
              headerLargeTitle: false,
              sheetAllowedDetents: [1.0],
              sheetGrabberVisible: true,
              sheetCornerRadius: 20,
            },
            default: {
              title: "Dar de alta empresa",
              presentation: "card",
              headerLargeTitle: false,
            },
          })}
        />
        <Stack.Screen name="reservations/[id]" options={{ title: "Reserva", headerLargeTitle: false }} />
        <Stack.Screen name="admin/stations" options={{ title: "Estaciones" }} />
        <Stack.Screen name="admin/sessions" options={{ title: "Sesiones" }} />
        <Stack.Screen name="admin/access-codes" options={{ title: "Códigos" }} />
        <Stack.Screen name="admin/roles" options={{ title: "Roles" }} />
        <Stack.Screen name="admin/reservations" options={{ title: "Reservas" }} />
        <Stack.Screen name="admin/audit-logs" options={{ title: "Auditoría" }} />
        <Stack.Screen name="admin/releases" options={{ title: "Versiones" }} />
      </Stack>
    </AppProvider>
  );
}
