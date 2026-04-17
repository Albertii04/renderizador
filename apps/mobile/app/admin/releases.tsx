import { Alert, FlatList, Text, View, RefreshControl } from "react-native";
import { useState } from "react";
import { useAppContext } from "../../src/providers/app-provider";
import { c } from "../../src/theme";
import { Badge, Card, EmptyState } from "../../src/components/ui";
import { showActionSheet } from "../../src/components/native";

export default function AdminReleasesScreen() {
  const { stations, releaseChannels, releaseVersions, assignReleaseChannel, refreshData } = useAppContext();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() { setRefreshing(true); await refreshData(); setRefreshing(false); }

  function pickChannel(stationId: string, currentChannel: string) {
    showActionSheet("Canal de versión", `Actual: ${currentChannel}`, releaseChannels
      .filter((ch) => ch.name !== currentChannel)
      .map((ch) => ({
        label: ch.name,
        onPress: async () => {
          const r = await assignReleaseChannel(stationId, ch.id);
          if (!r.ok) Alert.alert("Error", r.message ?? "Fallo al asignar.");
        },
      })));
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={stations}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
      ListHeaderComponent={
        <View style={{ paddingBottom: 8, gap: 12 }}>
          <Text style={{ color: c.white, fontSize: 20, fontWeight: "700" }}>Canales y versiones</Text>
          <Card>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Versiones publicadas</Text>
            {releaseVersions.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: 13 }}>Sin versiones publicadas.</Text>
            ) : releaseVersions.map((v) => {
              const ch = releaseChannels.find((c) => c.id === v.channelId);
              return (
                <View key={v.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                  <Text style={{ color: c.text, fontSize: 13 }}>{v.version}</Text>
                  <Badge label={ch?.name ?? "?"} color={c.info} />
                </View>
              );
            })}
          </Card>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Asignación por estación</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => pickChannel(item.id, item.releaseChannel)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.white, fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{item.stationCode}</Text>
            </View>
            <Badge label={item.releaseChannel} color={item.releaseChannel === "stable" ? c.success : c.warning} />
          </View>
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="🚀" title="Sin estaciones" />}
    />
  );
}
