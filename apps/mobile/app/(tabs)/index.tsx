import { ScrollView, Text, View, RefreshControl, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime, STATUS_COLOR } from "../../src/theme";
import { Badge, Button, Card } from "../../src/components/ui";
import { useState } from "react";

function hasAdminRole(roles: string[]) {
  return roles.some((r) => r === "station_admin" || r === "org_admin" || r === "super_admin");
}

const ADMIN_LINKS = [
  { label: "Estaciones", icon: "desktop-outline" as const, href: "/admin/stations" },
  { label: "Sesiones", icon: "pulse-outline" as const, href: "/admin/sessions" },
  { label: "Reservas", icon: "calendar-outline" as const, href: "/admin/reservations" },
  { label: "Códigos", icon: "key-outline" as const, href: "/admin/access-codes" },
  { label: "Roles", icon: "people-outline" as const, href: "/admin/roles" },
  { label: "Auditoría", icon: "document-text-outline" as const, href: "/admin/audit-logs" },
  { label: "Versiones", icon: "rocket-outline" as const, href: "/admin/releases" },
];

export default function HomeScreen() {
  const { profile, roles, reservations, refreshData, loading } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = hasAdminRole(roles);

  const now = new Date();
  const upcoming = reservations
    .filter((r) => new Date(r.endsAt) > now && r.status !== "cancelled")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const next = upcoming[0];

  async function onRefresh() {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 13) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
      >
        {/* Header */}
        <View style={{ paddingVertical: 8 }}>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: "500" }}>{greeting},</Text>
          <Text style={{ color: c.white, fontSize: 26, fontWeight: "700", marginTop: 2 }}>
            {profile?.displayName ?? profile?.email?.split("@")[0] ?? "Usuario"}
          </Text>
        </View>

        {/* Next reservation card */}
        {next ? (
          <Card onPress={() => router.push(`/reservations/${next.id}`)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={{ color: c.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" }}>Próxima reserva</Text>
              <Badge label={next.status} color={STATUS_COLOR[next.status] ?? c.subtle} />
            </View>
            <Text style={{ color: c.white, fontSize: 22, fontWeight: "700", marginTop: 10 }}>
              {fmtDateTime(next.startsAt)}
            </Text>
            <Text style={{ color: c.subtle, fontSize: 14, marginTop: 4 }}>
              hasta {fmtDateTime(next.endsAt)}
            </Text>
            {next.projectName ? (
              <Text style={{ color: c.text, fontSize: 14, marginTop: 10, fontWeight: "500" }}>{next.projectName}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 4 }}>
              <Ionicons name="chevron-forward" size={14} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: "600" }}>Ver detalles</Text>
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={{ color: c.muted, fontSize: 13 }}>No tienes reservas próximas.</Text>
          </Card>
        )}

        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            style={({ pressed }) => ({ flex: 1, backgroundColor: c.primary, borderRadius: 16, padding: 16, alignItems: "center", gap: 8, opacity: pressed ? 0.75 : 1 })}
            onPress={() => router.push("/reservations/create")}
          >
            <Ionicons name="add-circle" size={26} color="#082f49" />
            <Text style={{ color: "#082f49", fontWeight: "700", fontSize: 13 }}>Nueva reserva</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => ({ flex: 1, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, alignItems: "center", gap: 8, opacity: pressed ? 0.75 : 1 })}
            onPress={() => router.navigate("/(tabs)/stations")}
          >
            <Ionicons name="desktop-outline" size={26} color={c.primary} />
            <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>Estaciones</Text>
          </Pressable>
        </View>

        {/* Upcoming reservations mini list */}
        {upcoming.length > 1 && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>También próximamente</Text>
            {upcoming.slice(1, 4).map((res) => (
              <Card key={res.id} onPress={() => router.push(`/reservations/${res.id}`)}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: c.text, fontWeight: "600", fontSize: 14 }}>{fmtDateTime(res.startsAt)}</Text>
                    {res.projectName ? <Text style={{ color: c.muted, fontSize: 13 }}>{res.projectName}</Text> : null}
                  </View>
                  <Badge label={res.status} color={STATUS_COLOR[res.status] ?? c.subtle} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Admin section */}
        {isAdmin && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Administración</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {ADMIN_LINKS.map((item) => (
                <Pressable
                  key={item.href}
                  style={({ pressed }) => ({
                    width: "30%",
                    flexGrow: 1,
                    backgroundColor: c.surface,
                    borderRadius: r_lg,
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: 14,
                    alignItems: "center",
                    gap: 8,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  onPress={() => router.navigate(item.href as never)}
                >
                  <Ionicons name={item.icon} size={22} color={c.info} />
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: "600", textAlign: "center" }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const r_lg = 16;
