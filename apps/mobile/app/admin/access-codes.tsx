import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View, RefreshControl, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c, fmtDateTime } from "../../src/theme";
import { Badge, Button, Card, FieldInput, EmptyState } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";

function isoPlusDays(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString();
}

export default function AdminAccessCodesScreen() {
  const { stations, accessCodes, createAdminAccessCode, revokeAccessCode, refreshData } = useAppContext();
  const [stationId, setStationId] = useState("");
  const [validFrom, setValidFrom] = useState(new Date().toISOString());
  const [validUntil, setValidUntil] = useState(isoPlusDays(1));
  const [maxUses, setMaxUses] = useState("1");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function generate() {
    if (!stationId) { Alert.alert("Selecciona una estación"); return; }
    setBusy(true);
    const r = await createAdminAccessCode({
      stationId,
      validFrom,
      validUntil,
      maxUses: Math.max(parseInt(maxUses || "1", 10), 1),
    });
    setBusy(false);
    if (!r.ok) { Alert.alert("Error", r.message ?? "No se pudo generar."); return; }
    if (r.code) setGenerated(r.code);
  }

  async function onRefresh() {
    setRefreshing(true); await refreshData(); setRefreshing(false);
  }

  function revoke(id: string) {
    showActionSheet("Revocar código", "No podrá usarse de nuevo.", [
      { label: "Revocar", destructive: true, onPress: () => void revokeAccessCode(id) },
    ]);
  }

  const active = accessCodes.filter((a) => !a.disabledAt);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={active}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 16 }}>
            {generated && (
              <Card style={{ borderColor: c.success, borderWidth: 2 }}>
                <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Código generado</Text>
                <Text style={{ color: c.white, fontSize: 28, fontWeight: "800", letterSpacing: 4, textAlign: "center", marginVertical: 12, fontVariant: ["tabular-nums"] }}>{generated}</Text>
                <Text style={{ color: c.subtle, fontSize: 12, textAlign: "center" }}>Comparte con el usuario. No se mostrará de nuevo.</Text>
              </Card>
            )}

            <Card>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Nuevo código</Text>
              <View style={{ gap: 12 }}>
                <Text style={{ color: c.subtle, fontSize: 12, fontWeight: "600" }}>Estación</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {stations.map((s) => (
                    <Card key={s.id} onPress={() => setStationId(s.id)} style={{ padding: 10, borderColor: stationId === s.id ? c.primary : c.border, borderWidth: stationId === s.id ? 2 : 1 }}>
                      <Text style={{ color: c.text, fontWeight: "600" }}>{s.name}</Text>
                    </Card>
                  ))}
                </View>
                <FieldInput label="Válido desde (ISO)" value={validFrom} onChangeText={setValidFrom} autoCapitalize="none" />
                <FieldInput label="Válido hasta (ISO)" value={validUntil} onChangeText={setValidUntil} autoCapitalize="none" />
                <FieldInput label="Usos máximos" value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" />
                <Button label={busy ? "Generando…" : "Generar código"} onPress={() => void generate()} loading={busy} disabled={busy} />
              </View>
            </Card>

            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Códigos activos ({active.length})</Text>
          </View>
        }
        renderItem={({ item }) => {
          const station = stations.find((s) => s.id === item.stationId);
          return (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.white, fontWeight: "600" }}>{station?.name ?? "—"}</Text>
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
                    {fmtDateTime(item.validFrom)} → {fmtDateTime(item.validUntil)}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    Usos: {item.usedCount}{item.maxUses ? ` / ${item.maxUses}` : ""}
                  </Text>
                </View>
                <Button label="Revocar" variant="danger" onPress={() => revoke(item.id)} style={{ paddingVertical: 8, paddingHorizontal: 12 }} />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={<EmptyState icon="🔑" title="Sin códigos activos" />}
      />
    </KeyboardAvoidingView>
  );
}
