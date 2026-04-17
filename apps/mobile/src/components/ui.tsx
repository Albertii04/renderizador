import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { PressableProps, ViewStyle } from "react-native";
import { c, r } from "../theme";

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: string }
export function Badge({ label, color = c.subtle }: BadgeProps) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: color + "22", alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 11, fontWeight: "600", letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }
export function Card({ children, style, onPress }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [{
          backgroundColor: c.surface,
          borderRadius: r.xl,
          borderWidth: 1,
          borderColor: c.border,
          padding: 16,
          opacity: pressed ? 0.75 : 1,
        }, style]}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: r.xl, borderWidth: 1, borderColor: c.border, padding: 16 }, style]}>
      {children}
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 }}>
      {title}
    </Text>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
interface ButtonProps extends PressableProps {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
}
const btnColors: Record<ButtonVariant, { bg: string; text: string }> = {
  primary: { bg: c.primary, text: "#082f49" },
  secondary: { bg: c.surface, text: c.text },
  danger: { bg: "#7f1d1d", text: c.danger },
  ghost: { bg: "transparent", text: c.subtle },
};
export function Button({ label, variant = "primary", loading, icon, style, ...props }: ButtonProps & { style?: ViewStyle }) {
  const colors = btnColors[variant];
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [{
        backgroundColor: colors.bg,
        borderRadius: r.lg,
        paddingVertical: 14,
        paddingHorizontal: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: (pressed || props.disabled) ? 0.6 : 1,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: c.border,
      }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.text} /> : icon ?? null}
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
export function Row({ left, right, style }: { left: React.ReactNode; right?: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, style]}>
      <View style={{ flex: 1 }}>{left}</View>
      {right ? <View style={{ marginLeft: 8 }}>{right}</View> : null}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
      {icon ? <Text style={{ fontSize: 36 }}>{icon}</Text> : null}
      <Text style={{ color: c.text, fontWeight: "600", fontSize: 16 }}>{title}</Text>
      {subtitle ? <Text style={{ color: c.muted, textAlign: "center", fontSize: 14 }}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}

// ─── Separator ────────────────────────────────────────────────────────────────
export function Separator() {
  return <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 16 }} />;
}

// ─── FieldInput ───────────────────────────────────────────────────────────────
import type { TextInputProps } from "react-native";
import { TextInput } from "react-native";
export function FieldInput(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: c.subtle, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.muted}
        style={[{
          backgroundColor: "#060f1e",
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: r.lg,
          paddingHorizontal: 14,
          paddingVertical: 13,
          color: c.white,
          fontSize: 15,
        }, style]}
        {...rest}
      />
    </View>
  );
}
