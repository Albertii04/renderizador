import { SectionList, Text, View, RefreshControl } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime, STATUS_COLOR } from "../../src/theme";
import { Badge, Button, Card, EmptyState } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";
import type { ReservationSummary } from "@renderizador/types";

export default function AdminReservationsScreen() {
  const { reservations, stations, cancelReservation, refreshData } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const upcoming = reservations.filter((r) => new Date(r.endsAt) > now && r.status !== "cancelled")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const past = reservations.filter((r) => new Date(r.endsAt) <= now || r.status === "cancelled")
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  async function onRefresh() { setRefreshing(true); await refreshData(); setRefreshing(false); }

  function onCancel(r: ReservationSummary) {
    showActionSheet("Cancelar reserva", "El usuario perderá acceso.", [
      { label: "Cancelar", destructive: true, onPress: () => void cancelReservation(r.id) },
    ]);
  }

  const sections = [
    ...(upcoming.length ? [{ title: "Próximas", data: upcoming }] : []),
    ...(past.length ? [{ title: "Pasadas", data: past }] : []),
  ];

  return (
    <SectionList
      style={{ backgroundColor: c.bg }}
      sections={sections}
      keyExtractor={(i) => i.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
      renderSectionHeader={({ section }) => (
        <View style={{ backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
            {section.title} · {section.data.length}
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const station = stations.find((s) => s.id === item.stationId);
        const canCancel = new Date(item.endsAt) > now && item.status !== "cancelled";
        return (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <Card onPress={() => router.push(`/reservations/${item.id}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.white, fontWeight: "600" }}>{station?.name ?? "—"}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{fmtDateTime(item.startsAt)} → {fmtDateTime(item.endsAt)}</Text>
                  {item.projectName ? <Text style={{ color: c.subtle, fontSize: 12, marginTop: 2 }}>{item.projectName}</Text> : null}
                </View>
                <Badge label={item.status} color={STATUS_COLOR[item.status] ?? c.subtle} />
              </View>
              {canCancel && (
                <Button label="Cancelar" variant="danger" onPress={() => onCancel(item)} style={{ marginTop: 12, paddingVertical: 10 }} icon={<Ionicons name="close-circle-outline" size={15} color={c.danger} />} />
              )}
            </Card>
          </View>
        );
      }}
      ListEmptyComponent={<View style={{ padding: 16 }}><EmptyState icon="📅" title="Sin reservas" /></View>}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}
