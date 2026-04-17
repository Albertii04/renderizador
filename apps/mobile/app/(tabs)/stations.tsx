import { FlatList, Text, View, RefreshControl } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime } from "../../src/theme";
import { Badge, Card, EmptyState, Spinner } from "../../src/components/ui";
import type { StationSummary } from "@renderizador/types";

function StationCard({ station }: { station: StationSummary }) {
  const isOccupied = !!station.activeSessionId;
  const statusColor = isOccupied ? c.warning : c.success;
  const statusLabel = isOccupied ? "Ocupada" : "Disponible";

  return (
    <Card onPress={() => router.push(`/stations/${station.id}`)} style={{ margin: 0 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: c.white, fontWeight: "700", fontSize: 16 }}>{station.name}</Text>
          <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{station.stationCode}</Text>
          {station.location ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 }}>
              <Ionicons name="location-outline" size={13} color={c.muted} />
              <Text style={{ color: c.muted, fontSize: 13 }}>{station.location}</Text>
            </View>
          ) : null}
        </View>
        <Badge label={statusLabel} color={statusColor} />
      </View>
      {station.nextReservationStartsAt && !isOccupied ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 4, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
          <Ionicons name="time-outline" size={13} color={c.muted} />
          <Text style={{ color: c.muted, fontSize: 12 }}>Próxima: {fmtDateTime(station.nextReservationStartsAt)}</Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function StationsScreen() {
  const { stations, loading, refreshData } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }

  const enabled = stations.filter((s) => s.enabled);
  const disabled = stations.filter((s) => !s.enabled);
  const all = [...enabled, ...disabled];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ color: c.white, fontSize: 26, fontWeight: "700" }}>Estaciones</Text>
        <Text style={{ color: c.muted, fontSize: 14, marginTop: 2 }}>
          {enabled.filter((s) => !s.activeSessionId).length} disponibles · {enabled.length} activas
        </Text>
      </View>
      {loading && all.length === 0 ? (
        <Spinner />
      ) : (
        <FlatList
          data={all}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          renderItem={({ item }) => <StationCard station={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
          ListEmptyComponent={<EmptyState icon="🖥️" title="Sin estaciones" subtitle="No hay estaciones configuradas aún." />}
        />
      )}
    </SafeAreaView>
  );
}
