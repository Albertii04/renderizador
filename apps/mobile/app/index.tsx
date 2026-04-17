import { Redirect } from "expo-router";
import { View } from "react-native";
import { useAppContext } from "../src/providers/app-provider";
import { Spinner } from "../src/components/ui";
import { c } from "../src/theme";

export default function IndexScreen() {
  const { signedIn, loading, memberships } = useAppContext();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Spinner />
      </View>
    );
  }
  if (!signedIn) return <Redirect href="/sign-in" />;
  if (memberships.length === 0) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
