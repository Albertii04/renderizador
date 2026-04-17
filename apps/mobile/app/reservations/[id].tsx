import { ScrollView, Text, View, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime, STATUS_COLOR } from "../../src/theme";
import { Badge, Button, Card } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";

export default function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reservations, stations, cancelReservation } = useAppContext();
  const reservation = reservations.find((r) => r.id === id);
  const station = stations.find((s) => s.id === reservation?.stationId);

  if (!reservation) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: c.muted }}>Reserva no encontrada.</Text>
      </View>
    );
  }

  const isPast = new Date(reservation.endsAt) <= new Date();
  const isCancelled = reservation.status === "cancelled";
  const canCancel = !isPast && !isCancelled;

  function confirmCancel() {
    showActionSheet("Cancelar reserva", "Esta acción no se puede deshacer.", [
      {
        label: "Cancelar reserva", destructive: true,
        onPress: async () => {
          const r = await cancelReservation(reservation!.id);
          if (!r.ok) Alert.alert("Error", r.message ?? "No se pudo cancelar.");
          else router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Estación</Text>
            <Text style={{ color: c.white, fontSize: 20, fontWeight: "700", marginTop: 4 }}>{station?.name ?? "—"}</Text>
            {station ? <Text style={{ color: c.muted, fontSize: 13 }}>{station.stationCode}</Text> : null}
          </View>
          <Badge label={reservation.status} color={STATUS_COLOR[reservation.status] ?? c.subtle} />
        </View>
      </Card>

      <Card>
        <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Horario</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="play-circle-outline" size={16} color={c.success} />
          <Text style={{ color: c.text, fontSize: 14 }}>{fmtDateTime(reservation.startsAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Ionicons name="stop-circle-outline" size={16} color={c.danger} />
          <Text style={{ color: c.text, fontSize: 14 }}>{fmtDateTime(reservation.endsAt)}</Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 8 }}>
          Duración: {reservation.estimatedMinutes} min · Buffer: {reservation.bufferMinutes} min
        </Text>
      </Card>

      {(reservation.projectName || reservation.workType) && (
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Proyecto</Text>
          {reservation.projectName ? <Text style={{ color: c.white, fontSize: 15, fontWeight: "600" }}>{reservation.projectName}</Text> : null}
          {reservation.workType ? <Text style={{ color: c.subtle, fontSize: 13, marginTop: 2 }}>{reservation.workType}</Text> : null}
        </Card>
      )}

      {reservation.accessCode && (
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Código de acceso</Text>
          <Text style={{ color: c.white, fontSize: 28, fontWeight: "800", letterSpacing: 4, textAlign: "center", marginVertical: 14, fontVariant: ["tabular-nums"] }}>
            {reservation.accessCode}
          </Text>
          <Text style={{ color: c.subtle, fontSize: 12, textAlign: "center" }}>Introduce este código en la estación.</Text>
        </Card>
      )}

      {reservation.instructions ? (
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Instrucciones</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>{reservation.instructions}</Text>
        </Card>
      ) : null}

      {canCancel && <Button label="Cancelar reserva" variant="danger" onPress={confirmCancel} />}
    </ScrollView>
  );
}
