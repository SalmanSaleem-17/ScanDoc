import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/provider";
export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Label({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...props}
      style={[{ color: colors.text, fontSize: 15, lineHeight: 22 }, style]}
    />
  );
}
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color || colors.blue} />;
}
export function Screen({
  children,
  scroll = true,
  tabScreen = false,
}: React.PropsWithChildren<{ scroll?: boolean; tabScreen?: boolean }>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={tabScreen ? ["top", "left", "right"] : ["top", "bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
export function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Label
          accessibilityRole="header"
          numberOfLines={2}
          style={{
            fontSize: 27,
            lineHeight: 34,
            fontWeight: "700",
            letterSpacing: -0.8,
          }}
        >
          {title}
        </Label>
        {subtitle && (
          <Label
            style={{ color: colors.secondary, marginTop: 4, fontSize: 13 }}
          >
            {subtitle}
          </Label>
        )}
      </View>
      {action}
    </View>
  );
}
export function Button({
  title,
  onPress,
  icon,
  secondary,
  destructive,
  disabled,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  /** Tinted red: for actions that remove data and cannot be undone. */
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: destructive
            ? colors.dangerTint
            : secondary
              ? colors.tint
              : "#075FE4",
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          color={destructive ? colors.danger : secondary ? colors.blue : "white"}
          size={20}
        />
      )}
      <Label
        style={{
          color: destructive ? colors.danger : secondary ? colors.blue : "white",
          fontWeight: "600",
        }}
      >
        {title}
      </Label>
    </Pressable>
  );
}
/**
 * A compact action: icon above a short label, for rows of two to four
 * equally weighted actions (share, rename, trash). Full-width Buttons are for
 * the one thing a screen is mainly for.
 */
export function IconAction({
  name,
  title,
  onPress,
  destructive,
  disabled,
}: {
  name: IconName;
  title: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : colors.blue;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        {
          backgroundColor: destructive ? colors.dangerTint : colors.tint,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Icon name={name} color={color} size={22} />
      <Label style={{ color, fontSize: 12, lineHeight: 16, fontWeight: "600" }}>
        {title}
      </Label>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Icon name={name} />
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search documents",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.search,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Icon name="search-outline" color={colors.secondary} size={20} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.secondary}
        style={{ flex: 1, color: colors.text, minHeight: 48, fontSize: 14 }}
      />
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { marginTop: 26, marginBottom: 14 }]}>
      <Label
        accessibilityRole="header"
        style={{ fontSize: 18, fontWeight: "600", flex: 1 }}
      >
        {title}
      </Label>
      {action && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Label style={{ color: colors.blue, fontSize: 13 }}>{action}</Label>
        </Pressable>
      )}
    </View>
  );
}
export function EmptyState({
  title = "Nothing here yet",
  description = "Scan a page or import a PDF to get started.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
      <View
        style={{ padding: 18, backgroundColor: colors.tint, borderRadius: 20 }}
      >
        <Icon name="documents-outline" size={34} />
      </View>
      <Label style={{ fontWeight: "600", fontSize: 17 }}>{title}</Label>
      <Label
        style={{
          color: colors.secondary,
          textAlign: "center",
          maxWidth: 270,
          fontSize: 13,
        }}
      >
        {description}
      </Label>
      {action}
    </Card>
  );
}
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; title: string }[];
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup">
      <Label style={{ fontWeight: "600", fontSize: 13 }}>{label}</Label>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                flexGrow: 1,
                minWidth: 96,
                minHeight: 46,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? colors.blue : colors.border,
                backgroundColor: selected ? colors.tint : colors.surface,
              }}
            >
              <Label
                style={{
                  fontSize: 13,
                  fontWeight: selected ? "600" : "400",
                  color: selected ? colors.blue : colors.text,
                }}
              >
                {option.title}
              </Label>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export function Toggle({
  label,
  detail,
  value,
  onChange,
  disabled,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: value ? colors.blue : colors.border,
          backgroundColor: value ? colors.blue : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value && <Icon name="checkmark" size={15} color="#FFFFFF" />}
      </View>
      <View style={{ flex: 1 }}>
        <Label style={{ fontSize: 14 }}>{label}</Label>
        {detail && (
          <Label style={{ fontSize: 12, color: colors.secondary }}>
            {detail}
          </Label>
        )}
      </View>
    </Pressable>
  );
}
export function Loading({ text = "Opening your library…" }: { text?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 28, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={colors.blue} />
      <Label>{text}</Label>
    </View>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 24,
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
    gap: 12,
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  iconAction: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  card: { borderWidth: 1, borderRadius: 16, padding: 18 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
});
