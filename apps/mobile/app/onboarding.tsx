import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { AccessPolicy } from "@renderizador/supabase";
import { useAppContext } from "../src/providers/app-provider";
import { c } from "../src/theme";
import { Badge, Button, Card, FieldInput } from "../src/components/ui";

const POLICIES: Array<{ id: AccessPolicy; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { id: "open", title: "Toda mi empresa", subtitle: "Cualquiera con email del dominio entra.", icon: "globe-outline", color: "#34d399" },
  { id: "blocklist", title: "Toda con excepciones", subtitle: "Entran todos menos los bloqueados.", icon: "shield-half-outline", color: "#fbbf24" },
  { id: "allowlist", title: "Solo invitados", subtitle: "Solo los emails que tú añadas.", icon: "lock-closed-outline", color: "#f87171" },
];

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export default function OnboardingScreen() {
  const { profile, createOrganization } = useAppContext();
  const userDomain = profile?.email?.split("@")[1] ?? "";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [policy, setPolicy] = useState<AccessPolicy>("open");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    if (emails.includes(e)) return;
    setEmails([...emails, e]);
    setEmailInput("");
  }

  function removeEmail(e: string) {
    setEmails(emails.filter((x) => x !== e));
  }

  async function submit() {
    if (!name.trim()) { Alert.alert("Falta el nombre de la empresa"); return; }
    setBusy(true);
    const allowed = policy === "allowlist";
    const rules = policy === "open" ? [] : emails.map((email) => ({ email, allowed }));
    const resp = await createOrganization({
      name: name.trim(),
      slug: slugify(name),
      emailDomain: userDomain || null,
      accessPolicy: policy,
      rules,
    });
    setBusy(false);
    if (!resp.ok) { Alert.alert("Error", resp.message ?? "No se pudo crear."); return; }
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
        {/* Progress */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s <= step ? c.primary : c.border }} />
          ))}
        </View>

        {step === 1 && (
          <View style={{ gap: 20 }}>
            <View>
              <Text style={{ color: c.white, fontSize: 24, fontWeight: "700" }}>Tu empresa</Text>
              <Text style={{ color: c.muted, fontSize: 14, marginTop: 4 }}>Información básica de la organización.</Text>
            </View>
            <FieldInput label="Nombre de la empresa" value={name} onChangeText={setName} placeholder="Acme Studios" />

            {/* Domain — read-only, from Microsoft account */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: c.subtle, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 }}>Dominio de email</Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#060f1e", borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, gap: 10 }}>
                <Ionicons name="logo-microsoft" size={16} color={c.info} />
                <Text style={{ color: c.white, fontSize: 15, flex: 1 }}>{userDomain || "Sin dominio"}</Text>
                <Ionicons name="lock-closed" size={14} color={c.muted} />
              </View>
              <Text style={{ color: c.muted, fontSize: 11 }}>Se extrae de tu cuenta Microsoft ({profile?.email}).</Text>
            </View>

            <Button label="Continuar" onPress={() => setStep(2)} disabled={!name.trim() || !userDomain} />
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ color: c.white, fontSize: 24, fontWeight: "700" }}>Quién puede entrar</Text>
              <Text style={{ color: c.muted, fontSize: 14, marginTop: 4 }}>Elige la política de acceso.</Text>
            </View>
            <View style={{ gap: 10 }}>
              {POLICIES.map((p) => {
                const active = policy === p.id;
                return (
                  <Card
                    key={p.id}
                    onPress={() => setPolicy(p.id)}
                    style={{ borderColor: active ? p.color : c.border, borderWidth: active ? 2 : 1 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: p.color + "22", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={p.icon} size={22} color={p.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.white, fontWeight: "700", fontSize: 15 }}>{p.title}</Text>
                        <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{p.subtitle}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={22} color={p.color} />}
                    </View>
                  </Card>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Atrás" variant="secondary" onPress={() => setStep(1)} style={{ flex: 1 }} />
              <Button label={policy === "open" ? "Revisar" : "Continuar"} onPress={() => setStep(policy === "open" ? 3 : 3)} style={{ flex: 2 }} />
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ color: c.white, fontSize: 24, fontWeight: "700" }}>
                {policy === "blocklist" ? "Bloqueados" : policy === "allowlist" ? "Invitados" : "Confirmar"}
              </Text>
              <Text style={{ color: c.muted, fontSize: 14, marginTop: 4 }}>
                {policy === "open"
                  ? "Todo listo para crear la empresa."
                  : policy === "blocklist"
                    ? "Emails que NO podrán entrar."
                    : "Emails que SÍ podrán entrar."}
              </Text>
            </View>

            {policy !== "open" && (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <FieldInput value={emailInput} onChangeText={setEmailInput} placeholder="email@dominio.com" autoCapitalize="none" keyboardType="email-address" onSubmitEditing={addEmail} />
                  </View>
                  <Pressable onPress={addEmail} style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: 16, width: 52, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="add" size={24} color="#082f49" />
                  </Pressable>
                </View>
                <View style={{ gap: 6 }}>
                  {emails.map((e) => (
                    <Card key={e} style={{ padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: c.text, flex: 1 }}>{e}</Text>
                      <Pressable onPress={() => removeEmail(e)} hitSlop={10}>
                        <Ionicons name="close-circle" size={20} color={c.danger} />
                      </Pressable>
                    </Card>
                  ))}
                  {emails.length === 0 && (
                    <Text style={{ color: c.muted, fontSize: 13, textAlign: "center", padding: 16 }}>
                      {policy === "allowlist" ? "Añade al menos un email." : "Sin excepciones — todos entran."}
                    </Text>
                  )}
                </View>
              </>
            )}

            <Card>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Resumen</Text>
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.text }}><Text style={{ color: c.muted }}>Empresa: </Text>{name}</Text>
                <Text style={{ color: c.text }}><Text style={{ color: c.muted }}>Dominio: </Text>{userDomain || "—"}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: c.muted }}>Acceso: </Text>
                  <Badge label={POLICIES.find((p) => p.id === policy)?.title ?? policy} color={POLICIES.find((p) => p.id === policy)?.color ?? c.info} />
                </View>
                {policy !== "open" && <Text style={{ color: c.text }}><Text style={{ color: c.muted }}>Emails: </Text>{emails.length}</Text>}
              </View>
            </Card>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Atrás" variant="secondary" onPress={() => setStep(2)} style={{ flex: 1 }} />
              <Button
                label={busy ? "Creando…" : "Crear empresa"}
                onPress={submit}
                loading={busy}
                disabled={busy || (policy === "allowlist" && emails.length === 0)}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
