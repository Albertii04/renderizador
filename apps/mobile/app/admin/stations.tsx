import { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../src/providers/app-provider";
import { c } from "../../src/theme";
import { Badge, Button, Card, FieldInput, EmptyState } from "../../src/components/ui";
import { BottomSheet, showActionSheet } from "../../src/components/native";

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface FormState {
  id: string | null;
  name: string;
  stationCode: string;
  location: string;
  instructions: string;
  d5ExecutablePath: string;
  rdpCommand: string;
  rdpHost: string;
  rdpWindowsUsername: string;
  rdpWindowsPassword: string;
  enabled: boolean;
  releaseChannelId: string | null;
  pairedAt: string | null;
}

const emptyForm: FormState = {
  id: null, name: "", stationCode: "", location: "", instructions: "",
  d5ExecutablePath: "", rdpCommand: "", rdpHost: "",
  rdpWindowsUsername: "", rdpWindowsPassword: "",
  enabled: true, releaseChannelId: null, pairedAt: null,
};

export default function AdminStationsScreen() {
  const { memberships, stations, releaseChannels, createStation, updateStation, generateStationPairingCode, unpairStation, deleteStation } = useAppContext();
  const organizationId = memberships[0]?.organizationId ?? "";

  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string; stationName: string } | null>(null);

  // Re-evaluate online/offline status every 15s. The list re-renders and the
  // green/gray dot flips when a station's last_seen_at ages past the threshold.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  // Pulse state for the online indicator (blinks twice per second).
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => !p), 700);
    return () => clearInterval(timer);
  }, []);

  function openNew() {
    setForm({ ...emptyForm, releaseChannelId: releaseChannels[0]?.id ?? null });
    setOpen(true);
  }

  function openEdit(id: string) {
    const s = stations.find((st) => st.id === id);
    if (!s) return;
    setForm({
      id: s.id,
      name: s.name,
      stationCode: s.stationCode,
      location: s.location ?? "",
      instructions: s.instructions,
      d5ExecutablePath: s.d5ExecutablePath ?? "",
      rdpCommand: s.rdpCommand ?? "",
      rdpHost: s.rdpHost ?? "",
      rdpWindowsUsername: s.rdpWindowsUsername ?? "",
      rdpWindowsPassword: s.rdpWindowsPassword ?? "",
      enabled: s.enabled,
      releaseChannelId: releaseChannels.find((ch) => ch.name === s.releaseChannel)?.id ?? null,
      pairedAt: s.pairedAt ?? null,
    });
    setOpen(true);
  }

  function pickChannel() {
    showActionSheet("Canal de versión", undefined, releaseChannels.map((ch) => ({
      label: ch.name,
      onPress: () => setForm((f) => ({ ...f, releaseChannelId: ch.id })),
    })));
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name || !form.stationCode) { Alert.alert("Faltan datos", "Nombre y código son obligatorios."); return; }
    const payload = {
      name: form.name, slug: slugify(form.name || form.stationCode),
      stationCode: form.stationCode, location: form.location,
      instructions: form.instructions,
      d5ExecutablePath: form.d5ExecutablePath, rdpCommand: form.rdpCommand,
      rdpHost: form.rdpHost, rdpWindowsUsername: form.rdpWindowsUsername, rdpWindowsPassword: form.rdpWindowsPassword,
      releaseChannelId: form.releaseChannelId,
    };
    setBusy(true);
    const resp = form.id
      ? await updateStation({ id: form.id, enabled: form.enabled, ...payload })
      : await createStation({ organizationId, ...payload });
    setBusy(false);
    if (!resp.ok) { Alert.alert("Error", resp.message ?? "No se pudo guardar."); return; }
    setOpen(false);
    if (!form.id && "pairingCode" in resp && resp.pairingCode) {
      setPairing({ code: resp.pairingCode, expiresAt: resp.pairingExpiresAt ?? "", stationName: form.name });
    }
  }

  async function confirmUnpair() {
    if (!form.id) return;
    Alert.alert(
      "Desvincular estación",
      "El servidor quedará bloqueado. Tendrás que generar un nuevo código para volver a vincularlo.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desvincular",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const resp = await unpairStation(form.id!);
            setBusy(false);
            if (!resp.ok) { Alert.alert("Error", resp.message ?? "No se pudo desvincular."); return; }
            setForm((f) => ({ ...f, pairedAt: null }));
            setOpen(false);
          }
        }
      ]
    );
  }

  async function confirmDelete() {
    if (!form.id) return;
    Alert.alert(
      "Eliminar estación",
      "La estación y todos sus datos asociados (reservas, sesiones, códigos, historial) se borrarán permanentemente. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const resp = await deleteStation(form.id!);
            setBusy(false);
            if (!resp.ok) { Alert.alert("Error", resp.message ?? "No se pudo eliminar."); return; }
            setOpen(false);
          }
        }
      ]
    );
  }

  async function regeneratePairing() {
    if (!form.id) return;
    setBusy(true);
    const resp = await generateStationPairingCode(form.id);
    setBusy(false);
    if (!resp.ok || !resp.code) { Alert.alert("Error", resp.message ?? "No se pudo generar código."); return; }
    setOpen(false);
    setPairing({ code: resp.code, expiresAt: resp.expiresAt ?? "", stationName: form.name });
  }

  const channelName = releaseChannels.find((ch) => ch.id === form.releaseChannelId)?.name ?? "Sin canal";

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={stations}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <Pressable
            onPress={openNew}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.primary, backgroundColor: c.primary + "1a",
              marginBottom: 10, opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="add-circle-outline" size={18} color={c.primary} />
            <Text style={{ color: c.primary, fontWeight: "700" }}>Nueva estación</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const paired = !!item.pairedAt;
          const lastSeen = item.lastSeenAt ? new Date(item.lastSeenAt).getTime() : 0;
          const online = lastSeen > 0 && Date.now() - lastSeen < 120000;
          return (
            <Card onPress={() => openEdit(item.id)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.white, fontWeight: "600", fontSize: 15 }}>{item.name}</Text>
                  <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{item.stationCode}{item.location ? ` · ${item.location}` : ""}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: online ? c.success : c.muted,
                      opacity: online ? (pulse ? 1 : 0.25) : 1,
                      shadowColor: online ? c.success : "transparent",
                      shadowOpacity: online ? 0.9 : 0,
                      shadowRadius: online ? 6 : 0,
                    }}
                  />
                  <Ionicons
                    name={paired ? "link" : "unlink"}
                    size={16}
                    color={paired ? c.success : c.muted}
                  />
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={<EmptyState icon="🖥️" title="Sin estaciones" subtitle="Crea la primera con el botón de arriba." />}
      />

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Editar estación" : "Nueva estación"}
        primary={{ label: busy ? "Guardando…" : "Guardar", onPress: save, loading: busy, disabled: busy }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
            <FieldInput label="Nombre" value={form.name} onChangeText={(v) => set("name", v)} />
            <FieldInput label="Código" value={form.stationCode} onChangeText={(v) => set("stationCode", v)} autoCapitalize="characters" />
            <FieldInput label="Ubicación" value={form.location} onChangeText={(v) => set("location", v)} />
            <FieldInput
              label="Instrucciones"
              value={form.instructions}
              onChangeText={(v) => set("instructions", v)}
              multiline numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />

            {form.id && (
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={regeneratePairing}
                  disabled={busy}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.primary, backgroundColor: c.primary + "1a",
                    opacity: pressed || busy ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="key-outline" size={18} color={c.primary} />
                  <Text style={{ color: c.primary, fontWeight: "700" }}>Generar código de vinculación</Text>
                </Pressable>
                {form.pairedAt ? (
                  <Pressable
                    onPress={confirmUnpair}
                    disabled={busy}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.danger, backgroundColor: c.danger + "1a",
                      opacity: pressed || busy ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="unlink-outline" size={18} color={c.danger} />
                    <Text style={{ color: c.danger, fontWeight: "700" }}>Desvincular estación</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 10 }}>
                    <Ionicons name="unlink" size={14} color={c.muted} />
                    <Text style={{ color: c.muted, fontSize: 12 }}>Estación sin vincular</Text>
                  </View>
                )}
              </View>
            )}

            {form.id && (
              <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
                <View>
                  <Text style={{ color: c.text, fontWeight: "600" }}>Activa</Text>
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>Usuarios pueden reservarla</Text>
                </View>
                <Switch
                  value={form.enabled}
                  onValueChange={(v) => set("enabled", v)}
                  trackColor={{ false: c.border, true: c.primary }}
                  thumbColor={Platform.OS === "android" ? (form.enabled ? c.white : c.muted) : undefined}
                  ios_backgroundColor={c.border}
                />
              </Card>
            )}

            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>RDP</Text>
            <FieldInput label="Host / IP" value={form.rdpHost} onChangeText={(v) => set("rdpHost", v)} autoCapitalize="none" />
            <FieldInput label="Usuario Windows" value={form.rdpWindowsUsername} onChangeText={(v) => set("rdpWindowsUsername", v)} autoCapitalize="none" placeholder="DOMINIO\\usuario" />
            <FieldInput label="Contraseña Windows" value={form.rdpWindowsPassword} onChangeText={(v) => set("rdpWindowsPassword", v)} secureTextEntry />

            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>Avanzado</Text>
            <FieldInput label="Ruta ejecutable D5" value={form.d5ExecutablePath} onChangeText={(v) => set("d5ExecutablePath", v)} autoCapitalize="none" />
            <FieldInput label="Comando RDP legado" value={form.rdpCommand} onChangeText={(v) => set("rdpCommand", v)} autoCapitalize="none" />

            <Card onPress={pickChannel} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
              <View>
                <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Canal de versión</Text>
                <Text style={{ color: c.text, fontWeight: "600", marginTop: 4 }}>{channelName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Card>

            {form.id && (
              <Pressable
                onPress={confirmDelete}
                disabled={busy}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.danger, backgroundColor: c.danger,
                  opacity: pressed || busy ? 0.7 : 1, marginTop: 16,
                })}
              >
                <Ionicons name="trash-outline" size={18} color={c.white} />
                <Text style={{ color: c.white, fontWeight: "700" }}>Eliminar estación</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>

      <BottomSheet
        visible={pairing !== null}
        onClose={() => setPairing(null)}
        title="Código de vinculación"
        primary={{ label: "Hecho", onPress: () => setPairing(null) }}
      >
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16, alignItems: "center" }}>
          <Text style={{ color: c.muted, textAlign: "center", fontSize: 14 }}>
            Introduce este código en la app de escritorio (modo Servidor) para vincular la estación{pairing?.stationName ? ` "${pairing.stationName}"` : ""}.
          </Text>
          <View style={{ padding: 20, borderRadius: 20, borderWidth: 1, borderColor: c.primary, backgroundColor: c.primary + "1a" }}>
            <Text style={{ color: c.primary, fontSize: 40, fontWeight: "800", letterSpacing: 6, textAlign: "center" }}>
              {pairing?.code ?? ""}
            </Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 12, textAlign: "center" }}>
            Válido hasta {pairing?.expiresAt ? new Date(pairing.expiresAt).toLocaleTimeString() : "—"}. Un solo uso.
          </Text>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
