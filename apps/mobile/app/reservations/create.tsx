import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime } from "../../src/theme";
import { Badge, Button, Card, FieldInput } from "../../src/components/ui";
import { BottomSheet } from "../../src/components/native";

export default function CreateReservationScreen() {
  const params = useLocalSearchParams<{ stationId?: string }>();
  const { stations, createReservation } = useAppContext();
  const now = new Date();
  const defaultStart = new Date(Math.ceil(now.getTime() / 900000) * 900000);
  const defaultEnd = new Date(defaultStart.getTime() + 90 * 60000);

  const [stationId, setStationId] = useState<string>(params.stationId ?? "");
  const [startsAt, setStartsAt] = useState<Date>(defaultStart);
  const [endsAt, setEndsAt] = useState<Date>(defaultEnd);
  const [projectName, setProjectName] = useState("");
  const [workType, setWorkType] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [stationSheet, setStationSheet] = useState(false);

  // Android opens pickers on demand — iOS shows inline
  const [androidPicker, setAndroidPicker] = useState<null | "start-date" | "start-time" | "end-date" | "end-time">(null);

  const enabledStations = useMemo(() => stations.filter((s) => s.enabled), [stations]);
  const selected = stations.find((s) => s.id === stationId);

  async function submit() {
    if (!selected) { Alert.alert("Selecciona una estación"); return; }
    if (endsAt <= startsAt) { Alert.alert("Fecha inválida", "El fin debe ser posterior al inicio."); return; }
    const mins = Math.max(Math.round((endsAt.getTime() - startsAt.getTime()) / 60000), 1);
    setBusy(true);
    const resp = await createReservation({
      stationId: selected.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      estimatedMinutes: mins,
      projectName,
      workType,
    });
    setBusy(false);
    if (!resp.ok) { Alert.alert("Error", resp.message ?? "No se pudo crear la reserva."); return; }
    if (resp.accessCode) setAccessCode(resp.accessCode);
    else router.replace("/(tabs)/reservations");
  }

  if (accessCode) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 16 }}>
        <Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Reserva creada</Text>
          <Text style={{ color: c.white, fontSize: 34, fontWeight: "800", letterSpacing: 4, textAlign: "center", marginVertical: 20, fontVariant: ["tabular-nums"] }}>{accessCode}</Text>
          <Text style={{ color: c.subtle, fontSize: 13, textAlign: "center", lineHeight: 19 }}>Usa este código en la estación para desbloquearla.</Text>
        </Card>
        <Button label="Ver mis reservas" onPress={() => router.replace("/(tabs)/reservations")} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 16, paddingBottom: 40 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Station picker row */}
        <View>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Estación</Text>
          <Card onPress={() => setStationSheet(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                {selected ? (
                  <>
                    <Text style={{ color: c.white, fontWeight: "600", fontSize: 16 }}>{selected.name}</Text>
                    <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{selected.stationCode}{selected.location ? ` · ${selected.location}` : ""}</Text>
                  </>
                ) : (
                  <Text style={{ color: c.muted, fontSize: 15 }}>Seleccionar estación…</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </View>
          </Card>
        </View>

        {/* Date/time — native pickers */}
        <View>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Inicio</Text>
          <Card>
            {Platform.OS === "ios" ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "500" }}>Fecha y hora</Text>
                <DateTimePicker
                  value={startsAt}
                  mode="datetime"
                  onChange={(_, d) => d && setStartsAt(d)}
                  minimumDate={now}
                  themeVariant="dark"
                  accentColor={c.primary}
                />
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12 }} onPress={() => setAndroidPicker("start-date")}>
                  <Text style={{ color: c.text }}>{startsAt.toLocaleDateString("es-ES")}</Text>
                </Pressable>
                <Pressable style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12 }} onPress={() => setAndroidPicker("start-time")}>
                  <Text style={{ color: c.text }}>{startsAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</Text>
                </Pressable>
              </View>
            )}
          </Card>
        </View>

        <View>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Fin</Text>
          <Card>
            {Platform.OS === "ios" ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "500" }}>Fecha y hora</Text>
                <DateTimePicker
                  value={endsAt}
                  mode="datetime"
                  onChange={(_, d) => d && setEndsAt(d)}
                  minimumDate={startsAt}
                  themeVariant="dark"
                  accentColor={c.primary}
                />
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12 }} onPress={() => setAndroidPicker("end-date")}>
                  <Text style={{ color: c.text }}>{endsAt.toLocaleDateString("es-ES")}</Text>
                </Pressable>
                <Pressable style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12 }} onPress={() => setAndroidPicker("end-time")}>
                  <Text style={{ color: c.text }}>{endsAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</Text>
                </Pressable>
              </View>
            )}
          </Card>
        </View>

        <Text style={{ color: c.muted, fontSize: 13, textAlign: "center" }}>
          {fmtDateTime(startsAt.toISOString())} → {fmtDateTime(endsAt.toISOString())}
        </Text>

        {/* Project info */}
        <FieldInput label="Proyecto" value={projectName} onChangeText={setProjectName} placeholder="Nombre del proyecto" />
        <FieldInput label="Tipo de trabajo" value={workType} onChangeText={setWorkType} placeholder="Render, Modelado, Otro…" />

        <Button label={busy ? "Creando…" : "Crear reserva"} onPress={() => void submit()} loading={busy} disabled={busy} />
      </ScrollView>

      {/* Android modal pickers */}
      {androidPicker && (
        <DateTimePicker
          value={androidPicker.startsWith("start") ? startsAt : endsAt}
          mode={androidPicker.endsWith("date") ? "date" : "time"}
          onChange={(_, d) => {
            setAndroidPicker(null);
            if (!d) return;
            if (androidPicker === "start-date" || androidPicker === "start-time") setStartsAt(d);
            else setEndsAt(d);
          }}
          minimumDate={androidPicker.startsWith("end") ? startsAt : now}
        />
      )}

      {/* Station picker sheet */}
      <BottomSheet visible={stationSheet} onClose={() => setStationSheet(false)} title="Seleccionar estación">
        <FlatList
          data={enabledStations}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => {
            const isBusy = !!item.activeSessionId;
            const isSel = stationId === item.id;
            return (
              <Card
                onPress={() => { setStationId(item.id); setStationSheet(false); }}
                style={{ borderColor: isSel ? c.primary : c.border, borderWidth: isSel ? 2 : 1 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: c.white, fontWeight: "600" }}>{item.name}</Text>
                    <Text style={{ color: c.muted, fontSize: 13 }}>{item.stationCode}{item.location ? ` · ${item.location}` : ""}</Text>
                  </View>
                  <Badge label={isBusy ? "Ocupada" : "Libre"} color={isBusy ? c.warning : c.success} />
                </View>
              </Card>
            );
          }}
        />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
