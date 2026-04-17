import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../src/providers/app-provider";
import { c } from "../src/theme";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { signIn } = useAppContext();
  const [busy, setBusy] = useState<null | "login" | "onboard">(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(kind: "login" | "onboard") {
    setBusy(kind);
    setError(null);
    const result = await signIn();
    setBusy(null);
    if (!result.ok) {
      setError(result.message ?? "Sign-in failed.");
      return;
    }
    router.replace(kind === "onboard" ? "/onboarding" : "/(tabs)");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center", gap: 32 }}>
        {/* Brand */}
        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: c.primary + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="desktop" size={34} color={c.primary} />
          </View>
          <Text style={{ color: c.white, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }}>Renderizador</Text>
          <Text style={{ color: c.muted, fontSize: 14, textAlign: "center", maxWidth: 280 }}>
            Gestiona reservas y estaciones de trabajo desde tu móvil.
          </Text>
        </View>

        {/* Primary CTA */}
        <Pressable
          disabled={!!busy}
          onPress={() => handle("login")}
          style={({ pressed }) => ({
            backgroundColor: c.primary,
            borderRadius: 16,
            paddingVertical: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: pressed || busy ? 0.6 : 1,
          })}
        >
          <Ionicons name="logo-microsoft" size={18} color="#082f49" />
          <Text style={{ color: "#082f49", fontWeight: "700", fontSize: 16 }}>
            {busy === "login" ? "Abriendo Microsoft…" : "Iniciar sesión con Microsoft"}
          </Text>
        </Pressable>

        {/* Separator */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1 }}>O</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </View>

        {/* Secondary CTA */}
        <Pressable
          disabled={!!busy}
          onPress={() => handle("onboard")}
          style={({ pressed }) => ({
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 16,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            opacity: pressed || busy ? 0.6 : 1,
          })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.info + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="business-outline" size={20} color={c.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.white, fontWeight: "700", fontSize: 15 }}>Dar de alta tu empresa</Text>
            <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
              {busy === "onboard" ? "Abriendo Microsoft…" : "Requiere Microsoft · extrae el dominio"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>

        {error && (
          <Text style={{ color: c.danger, textAlign: "center", fontSize: 13 }}>{error}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}
