import type { PropsWithChildren } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

export function Screen(props: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#020617" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#7dd3fc", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>Renderizador</Text>
          <Text style={{ color: "#fff", fontSize: 32, fontWeight: "700" }}>{props.title}</Text>
          {props.subtitle ? <Text style={{ color: "#94a3b8", fontSize: 16 }}>{props.subtitle}</Text> : null}
        </View>
        {props.children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Panel(props: PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ backgroundColor: "#0f172a", borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: "#1e293b" }}>
      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>{props.title}</Text>
      {props.children}
    </View>
  );
}
