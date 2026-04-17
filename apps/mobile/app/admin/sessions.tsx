import { FlatList, Text, View, RefreshControl } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime, STATUS_COLOR } from "../../src/theme";
import { Badge, Button, Card, EmptyState } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";
import type { SessionSummary } from "@renderizador/types";

export default function AdminSessionsScreen() {
  const { sessions, stations, refreshData, revokeSession, extendSession } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);

  const active = sessions.filter((s) => !s.actualEndAt && !s.revokedAt);

  async function onRefresh() {
    setRefreshing(true); await refreshData(); setRefreshing(false);
  }

  function onExtend(s: SessionSummary) {
    showActionSheet("Extender sesión", "¿Cuántos minutos añadir?", [
      { label: "+15 minutos", onPress: () => void extendSession(s.id, 15) },
      { label: "+30 minutos", onPress: () => void extendSession(s.id, 30) },
      { label: "+60 minutos", onPress: () => void extendSession(s.id, 60) },
    ]);
  }

  function onRevoke(s: SessionSummary) {
    showActionSheet("Revocar sesión", "El usuario será expulsado.", [
      { label: "Revocar", destructive: true, onPress: () => void revokeSession(s.id) },
    ]);
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={active}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
      ListHeaderComponent={
        <View style={{ paddingBottom: 8 }}>
          <Text style={{ color: c.white, fontSize: 20, fontWeight: "700" }}>{active.length} sesiones activas</Text>
        </View>
      }
      renderItem={({ item }) => {
        const station = stations.find((s) => s.id === item.stationId);
        return (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.white, fontWeight: "700", fontSize: 15 }}>{station?.name ?? "Estación"}</Text>
                <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>
                  Inicio: {fmtDateTime(item.startsAt)}
                </Text>
                {item.estimatedEndAt ? (
                  <Text style={{ color: c.muted, fontSize: 13 }}>Fin estimado: {fmtDateTime(item.estimatedEndAt)}</Text>
                ) : null}
              </View>
              <Badge label={item.warningLevel} color={STATUS_COLOR[item.warningLevel] ?? c.subtle} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button label="Extender" variant="secondary" onPress={() => onExtend(item)} icon={<Ionicons name="time-outline" size={15} color={c.text} />} style={{ flex: 1, paddingVertical: 10 }} />
              <Button label="Revocar" variant="danger" onPress={() => onRevoke(item)} icon={<Ionicons name="close-circle-outline" size={15} color={c.danger} />} style={{ flex: 1, paddingVertical: 10 }} />
            </View>
          </Card>
        );
      }}
      ListEmptyComponent={<EmptyState icon="💤" title="Sin sesiones activas" />}
    />
  );
}
