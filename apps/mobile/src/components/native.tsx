import { ActionSheetIOS, Alert, Modal, Platform, Pressable, Text, View } from "react-native";
import { c } from "../theme";
import { Button } from "./ui";

// ─── Action sheet (native on iOS, Alert fallback on Android) ──────────────────
export interface ActionChoice {
  label: string;
  destructive?: boolean;
  onPress?: () => void | Promise<void>;
}

export function showActionSheet(title: string, message: string | undefined, choices: ActionChoice[]) {
  if (Platform.OS === "ios") {
    const labels = [...choices.map((c) => c.label), "Cancelar"];
    const cancelIdx = labels.length - 1;
    const destructiveIdx = choices.findIndex((c) => c.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: labels,
        cancelButtonIndex: cancelIdx,
        destructiveButtonIndex: destructiveIdx >= 0 ? destructiveIdx : undefined,
        userInterfaceStyle: "dark",
      },
      (idx) => {
        if (idx === cancelIdx) return;
        choices[idx]?.onPress?.();
      }
    );
  } else {
    Alert.alert(title, message, [
      ...choices.map((c) => ({
        text: c.label,
        style: c.destructive ? ("destructive" as const) : ("default" as const),
        onPress: () => void c.onPress?.(),
      })),
      { text: "Cancelar", style: "cancel" },
    ]);
  }
}

// ─── Bottom sheet modal (slide-up) ────────────────────────────────────────────
interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  primary?: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };
}

export function BottomSheet({ visible, onClose, title, children, primary }: SheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"}
      transparent={Platform.OS === "android"}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: c.primary, fontSize: 16 }}>Cancelar</Text>
          </Pressable>
          <Text style={{ color: c.white, fontSize: 16, fontWeight: "700" }}>{title}</Text>
          <View style={{ width: 70 }} />
        </View>
        <View style={{ flex: 1 }}>{children}</View>
        {primary && (
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: c.border }}>
            <Button label={primary.label} onPress={primary.onPress} loading={primary.loading} disabled={primary.disabled} />
          </View>
        )}
      </View>
    </Modal>
  );
}
