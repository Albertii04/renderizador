import { FlatList, Text, View, RefreshControl, Pressable } from "react-native";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime, STATUS_COLOR } from "../../src/theme";
import { Badge, Card, EmptyState } from "../../src/components/ui";
import type { ReservationSummary } from "@renderizador/types";

function ReservationRow({ item }: { item: ReservationSummary }) {
  const { stations } = useAppContext();
  const station = stations.find((s) => s.id === item.stationId);
  return (
    <Card onPress={() => router.push(`/reservations/${item.id}`)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: c.white, fontWeight: "600", fontSize: 15 }}>{fmtDateTime(item.startsAt)}</Text>
          <Text style={{ color: c.muted, fontSize: 13, marginTop: 3 }}>
            {station?.name ?? "Estación"} · {item.projectName ?? "Sin proyecto"}
          </Text>
          <Text style={{ color: c.subtle, fontSize: 12, marginTop: 2 }}>hasta {fmtDateTime(item.endsAt)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Badge label={item.status} color={STATUS_COLOR[item.status] ?? c.subtle} />
          <Ionicons name="chevron-forward" size={14} color={c.muted} />
        </View>
      </View>
    </Card>
  );
}

export default function ReservationsScreen() {
  const { reservations, loading, refreshData } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState(0);

  async function onRefresh() {
    setRefreshing(true); await refreshData(); setRefreshing(false);
  }

  const now = new Date();
  const { upcoming, past } = useMemo(() => {
    const up = reservations.filter((r) => new Date(r.endsAt) > now && r.status !== "cancelled")
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const pa = reservations.filter((r) => new Date(r.endsAt) <= now || r.status === "cancelled")
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    return { upcoming: up, past: pa };
  }, [reservations]);

  const data = segment === 0 ? upcoming : past;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text style={{ color: c.white, fontSize: 26, fontWeight: "700" }}>Reservas</Text>
        <Pressable
          style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: 20, width: 38, height: 38, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
          onPress={() => router.push("/reservations/create")}
        >
          <Ionicons name="add" size={22} color="#082f49" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <SegmentedControl
          values={[`Próximas (${upcoming.length})`, `Pasadas (${past.length})`]}
          selectedIndex={segment}
          onChange={(e) => setSegment(e.nativeEvent.selectedSegmentIndex)}
          appearance="dark"
          tintColor={c.surface}
          backgroundColor="#0b1220"
          fontStyle={{ color: c.subtle, fontWeight: "600" }}
          activeFontStyle={{ color: c.white, fontWeight: "700" }}
        />
      </View>

      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
        renderItem={({ item }) => <ReservationRow item={item} />}
        ListEmptyComponent={
          <EmptyState
            icon={segment === 0 ? "📅" : "🗂️"}
            title={segment === 0 ? "Sin reservas próximas" : "Sin reservas pasadas"}
            subtitle={segment === 0 ? "Crea tu primera reserva con el botón +." : undefined}
          />
        }
      />
    </SafeAreaView>
  );
}
