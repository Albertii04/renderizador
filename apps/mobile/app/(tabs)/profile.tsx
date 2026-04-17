import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c } from "../../src/theme";
import { Card, Button, Badge } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";

const ROLE_LABELS: Record<string, string> = {
  user: "Usuario",
  station_admin: "Admin de estación",
  org_admin: "Admin de organización",
  super_admin: "Super Admin",
};

const ADMIN_ITEMS = [
  { label: "Gestionar estaciones", icon: "desktop-outline" as const, href: "/admin/stations", color: "#818cf8" },
  { label: "Sesiones activas", icon: "pulse-outline" as const, href: "/admin/sessions", color: "#34d399" },
  { label: "Todas las reservas", icon: "calendar-outline" as const, href: "/admin/reservations", color: "#38bdf8" },
  { label: "Códigos de acceso", icon: "key-outline" as const, href: "/admin/access-codes", color: "#fbbf24" },
  { label: "Roles y permisos", icon: "people-outline" as const, href: "/admin/roles", color: "#f87171" },
  { label: "Registro de auditoría", icon: "document-text-outline" as const, href: "/admin/audit-logs", color: "#94a3b8" },
  { label: "Versiones y canales", icon: "rocket-outline" as const, href: "/admin/releases", color: "#c084fc" },
];

function NavRow({ label, icon, href, color }: { label: string; icon: keyof typeof Ionicons.glyphMap; href: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: "500" }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.muted} />
    </View>
  );
}

export default function ProfileScreen() {
  const { profile, roles, memberships, signOut } = useAppContext();

  const isAdmin = roles.some((r) => r === "station_admin" || r === "org_admin" || r === "super_admin");

  function confirmSignOut() {
    showActionSheet("Cerrar sesión", "¿Seguro que quieres salir?", [
      { label: "Salir", destructive: true, onPress: () => void signOut().then(() => router.replace("/sign-in")) },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 120 }}>
        <Text style={{ color: c.white, fontSize: 26, fontWeight: "700", paddingTop: 8 }}>Perfil</Text>

        {/* User card */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary + "22", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={26} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              {profile?.displayName ? (
                <Text style={{ color: c.white, fontWeight: "700", fontSize: 17 }}>{profile.displayName}</Text>
              ) : null}
              <Text style={{ color: c.subtle, fontSize: 14 }}>{profile?.email ?? "—"}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {roles.map((role) => (
                  <Badge key={role} label={ROLE_LABELS[role] ?? role} color={c.info} />
                ))}
              </View>
            </View>
          </View>
        </Card>

        {/* Org memberships */}
        {memberships.length > 0 && (
          <Card>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Organización</Text>
            {memberships.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.text, fontSize: 14 }}>{m.organizationId.slice(0, 8)}…</Text>
                <Badge label={ROLE_LABELS[m.role] ?? m.role} color={c.info} />
              </View>
            ))}
          </Card>
        )}

        {/* Admin section */}
        {isAdmin && (
          <View>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Administración</Text>
            <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              {ADMIN_ITEMS.map((item, idx) => (
                <View key={item.href}>
                  <Pressable
                    onPress={() => router.navigate(item.href as never)}
                    android_ripple={{ color: c.border }}
                    style={({ pressed }) => ({ backgroundColor: pressed ? c.border : "transparent" })}
                  >
                    <NavRow label={item.label} icon={item.icon} href={item.href} color={item.color} />
                  </Pressable>
                  {idx < ADMIN_ITEMS.length - 1 && (
                    <View style={{ height: 1, backgroundColor: c.border, marginLeft: 64 }} />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <Button label="Cerrar sesión" variant="danger" onPress={confirmSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
