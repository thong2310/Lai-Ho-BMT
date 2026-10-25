import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STATUS_LABELS } from "@/shared/domain";

export const COLORS = {
  primary: "#0C8B78",
  ink: "#142C2A",
  muted: "#78918C",
  border: "#E1EBE7",
  bg: "#F5F8F6",
  amber: "#D89A29",
  pale: "#EAF5EE",
  white: "#FFFFFF",
};
export function Icon({
  name,
  size = 20,
  color = COLORS.ink,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const bg =
    variant === "primary"
      ? COLORS.primary
      : variant === "danger"
        ? "#C44445"
        : variant === "secondary"
          ? "#E9F4EF"
          : "transparent";
  const color =
    variant === "primary" || variant === "danger" ? "white" : COLORS.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.76 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} size={18} />
      ) : null}
      <Text style={[s.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9DAEA7"
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[
          s.input,
          multiline && { minHeight: 86, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
const tones = {
  green: ["#E9F5ED", "#24805C"],
  amber: ["#FFF4DE", "#B77A13"],
  blue: ["#E8F1FE", "#3477BF"],
  red: ["#FDECEC", "#C04A48"],
  gray: ["#F0F3F2", "#74867F"],
};
export function Pill({
  label,
  tone = "green",
}: {
  label: string;
  tone?: keyof typeof tones;
}) {
  return (
    <View style={[s.pill, { backgroundColor: tones[tone][0] }]}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: tones[tone][1],
        }}
      />
      <Text style={{ color: tones[tone][1], fontSize: 11, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}
export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle && <Text style={s.sub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
export function RouteLine({
  pickup,
  dropoff,
}: {
  pickup: string;
  dropoff: string;
}) {
  return (
    <View style={{ gap: 14, paddingVertical: 6 }}>
      <View style={s.routeRow}>
        <View style={[s.dot, { backgroundColor: COLORS.primary }]} />
        <Text style={s.routeText} numberOfLines={2}>
          {pickup}
        </Text>
      </View>
      <View
        style={{
          height: 16,
          borderLeftWidth: 1,
          borderStyle: "dashed",
          borderColor: "#A0B9AF",
          marginLeft: 4,
          marginTop: -8,
          marginBottom: -8,
        }}
      />
      <View style={s.routeRow}>
        <View
          style={[s.dot, { backgroundColor: "#E9A94B", borderRadius: 2 }]}
        />
        <Text style={s.routeText} numberOfLines={2}>
          {dropoff}
        </Text>
      </View>
    </View>
  );
}
export function Notice({
  text,
  tone = "green",
}: {
  text: string;
  tone?: keyof typeof tones;
}) {
  return (
    <View style={[s.notice, { backgroundColor: tones[tone][0] }]}>
      <Icon
        name={
          tone === "red" ? "alert-circle-outline" : "information-circle-outline"
        }
        color={tones[tone][1]}
        size={18}
      />
      <Text
        style={{ color: tones[tone][1], fontSize: 12, lineHeight: 19, flex: 1 }}
      >
        {text}
      </Text>
    </View>
  );
}
export function Empty({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ alignItems: "center", padding: 36, gap: 12 }}>
      <Icon name="file-tray-outline" size={36} color="#A3B9AD" />
      <Text
        style={{
          fontSize: 17,
          color: COLORS.ink,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text style={[s.sub, { textAlign: "center", maxWidth: 360 }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
export function StatusPill({
  status,
}: {
  status: import("@/shared/domain").RideStatus;
}) {
  const labels = STATUS_LABELS;
  return (
    <Pill
      label={labels[status]}
      tone={
        status === "completed"
          ? "green"
          : status === "cancelled"
            ? "red"
            : ["pending", "offered"].includes(status)
              ? "amber"
              : "blue"
      }
    />
  );
}
const s = StyleSheet.create({
  button: {
    minHeight: 45,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 13, fontWeight: "700" },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  label: { fontSize: 12, fontWeight: "600", color: "#526F63" },
  input: {
    padding: 13,
    backgroundColor: "#F8FAF8",
    borderWidth: 1,
    borderColor: "#E1EAE3",
    borderRadius: 10,
    fontSize: 14,
    color: COLORS.ink,
    minHeight: 47,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 23,
    color: COLORS.ink,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  sub: { color: COLORS.muted, fontSize: 13, lineHeight: 21 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  routeRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  routeText: { color: "#344D43", fontSize: 13, flex: 1, lineHeight: 19 },
  notice: {
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
});
