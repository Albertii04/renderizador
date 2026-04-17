import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime, STATUS_COLOR } from "../../src/theme";
import { Badge, Button, Card } from "../../src/components/ui";

export default function StationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stations, stationCatalog } = useAppContext();
  const station = stations.find((s) => s.id === id);
  const runtime = stationCatalog.find((r) => r.station?.id === id);

  if (!station) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: c.muted }}>Estación no encontrada.</Text>
      </View>
    );
  }

  const isOccupied = !!runtime?.activeSession;
  const session = runtime?.activeSession;
  const nextRes = runtime?.nextReservation;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      {/* Header card */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.white, fontSize: 22, fontWeight: "700" }}>{station.name}</Text>
            <Text style={{ color: c.muted, fontSize: 14, marginTop: 2 }}>Código: {station.stationCode}</Text>
          </View>
          <Badge label={isOccupied ? "Ocupada" : "Disponible"} color={isOccupied ? c.warning : c.success} />
        </View>
        {station.location ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
            <Ionicons name="location-outline" size={14} color={c.muted} />
            <Text style={{ color: c.subtle, fontSize: 14 }}>{station.location}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
          <Ionicons name="radio-outline" size={14} color={station.enabled ? c.success : c.danger} />
          <Text style={{ color: station.enabled ? c.success : c.danger, fontSize: 14 }}>
            {station.enabled ? "Activa" : "Deshabilitada"}
          </Text>
        </View>
      </Card>

      {/* Active session */}
      {session && (
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Sesión activa</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>Iniciada: {fmtDateTime(session.startsAt)}</Text>
              {session.estimatedEndAt ? (
                <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>Fin estimado: {fmtDateTime(session.estimatedEndAt)}</Text>
              ) : null}
            </View>
            <Badge label={session.warningLevel} color={STATUS_COLOR[session.warningLevel] ?? c.subtle} />
          </View>
        </Card>
      )}

      {/* Next reservation */}
      {nextRes && (
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Próxima reserva</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{fmtDateTime(nextRes.startsAt)} → {fmtDateTime(nextRes.endsAt)}</Text>
          {nextRes.projectName ? <Text style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>{nextRes.projectName}</Text> : null}
        </Card>
      )}

      {/* Instructions */}
      {station.instructions ? (
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Instrucciones</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>{station.instructions}</Text>
        </Card>
      ) : null}

      {/* Actions */}
      {station.enabled && !isOccupied && (
        <Button
          label="Reservar esta estación"
          onPress={() => router.push({ pathname: "/reservations/create", params: { stationId: id } })}
          icon={<Ionicons name="calendar-outline" size={18} color="#082f49" />}
        />
      )}
    </ScrollView>
  );
}
