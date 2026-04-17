import { FlatList, Text, View, RefreshControl } from "react-native";
import { useState } from "react";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime } from "../../src/theme";
import { Badge, Card, EmptyState } from "../../src/components/ui";

const ACTION_COLOR: Record<string, string> = {
  create: "#34d399",
  update: "#38bdf8",
  delete: "#f87171",
  revoke: "#f87171",
  grant: "#34d399",
};

function colorFor(action: string) {
  for (const k in ACTION_COLOR) if (action.includes(k)) return ACTION_COLOR[k];
  return "#94a3b8";
}

export default function AdminAuditLogsScreen() {
  const { auditLogs, refreshData } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() { setRefreshing(true); await refreshData(); setRefreshing(false); }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={auditLogs}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
      ListHeaderComponent={
        <Text style={{ color: c.white, fontSize: 20, fontWeight: "700", paddingBottom: 8 }}>
          {auditLogs.length} eventos
        </Text>
      }
      renderItem={({ item }) => (
        <Card style={{ padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.white, fontWeight: "600", fontSize: 14 }}>{item.action}</Text>
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{item.entityType}{item.entityId ? ` · ${item.entityId.slice(0, 8)}…` : ""}</Text>
              <Text style={{ color: c.subtle, fontSize: 11, marginTop: 2 }}>{fmtDateTime(item.createdAt)}</Text>
            </View>
            <Badge label={item.action.split("_")[0] ?? "?"} color={colorFor(item.action)} />
          </View>
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="📋" title="Sin eventos" />}
    />
  );
}
