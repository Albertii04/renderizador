import { Alert, FlatList, Text, View } from "react-native";
import { useAppContext } from "../../src/providers/app-provider";
import { c } from "../../src/theme";
import { Badge, Card, EmptyState } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";
import type { Role } from "@renderizador/types";

const ROLES: Role[] = ["user", "station_admin", "org_admin", "super_admin"];
const LABEL: Record<Role, string> = {
  user: "Usuario",
  station_admin: "Admin estación",
  org_admin: "Admin org",
  super_admin: "Super Admin",
};

export default function AdminRolesScreen() {
  const { memberships, updateRole } = useAppContext();

  function changeRole(id: string, current: Role) {
    showActionSheet("Cambiar rol", `Actual: ${LABEL[current]}`, ROLES.filter((r) => r !== current).map((r) => ({
      label: LABEL[r],
      onPress: async () => {
        const resp = await updateRole(id, r);
        if (!resp.ok) Alert.alert("Error", resp.message ?? "No se pudo cambiar el rol.");
      },
    })));
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={memberships}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      ListHeaderComponent={
        <Text style={{ color: c.white, fontSize: 20, fontWeight: "700", paddingBottom: 8 }}>
          {memberships.length} miembros
        </Text>
      }
      renderItem={({ item }) => (
        <Card onPress={() => changeRole(item.id, item.role)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.white, fontWeight: "600" }}>{item.id.slice(0, 8)}…</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>Org: {item.organizationId.slice(0, 8)}…</Text>
            </View>
            <Badge label={LABEL[item.role]} color={c.info} />
          </View>
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="👥" title="Sin miembros" />}
    />
  );
}
