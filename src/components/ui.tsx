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
import { useTheme, type Tone } from "../theme/provider";
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
            fontSize: 26,
            lineHeight: 32,
            fontWeight: "700",
            letterSpacing: -0.6,
          }}
        >
          {title}
        </Label>
        {subtitle && (
          <Label
            style={{ color: colors.secondary, marginTop: 3, fontSize: 13 }}
          >
            {subtitle}
          </Label>
        )}
      </View>
      {action}
    </View>
  );
}
/** The app's own header: icon, wordmark and tagline, with round actions. */
export function BrandHeader({
  logo,
  actions,
}: {
  logo: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { marginBottom: 18 }]}>
      {logo}
      <View style={{ flex: 1 }}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.6, color: colors.text }}
        >
          Scan
          <Text style={{ color: colors.blue }}>Doc</Text>
        </Text>
        <Label style={{ color: colors.secondary, fontSize: 13, lineHeight: 18 }}>
          Scanner, PDF & OCR
        </Label>
      </View>
      {actions}
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
  trailingIcon,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  /** Tinted red: for actions that remove data and cannot be undone. */
  destructive?: boolean;
  disabled?: boolean;
  trailingIcon?: IconName;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : secondary ? colors.blue : "#FFFFFF";
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
              : colors.blue,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {icon && <Icon name={icon} color={color} size={20} />}
      <Label style={{ color, fontWeight: "600" }}>{title}</Label>
      {trailingIcon && <Icon name={trailingIcon} color={color} size={18} />}
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
/** Round icon button on a surface disc, as in the screen headers. */
export function IconButton({
  name,
  label,
  onPress,
  plain = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  /** No disc, just the icon (for tight rows). */
  plain?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        !plain && {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={name} color={colors.text} size={21} />
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
/** A tinted square with an icon: the tool tiles on Home and Tools. */
export function ToolTile({
  title,
  icon,
  tone,
  onPress,
  disabled,
  width,
}: {
  title: string;
  icon: IconName;
  tone: Tone;
  onPress: () => void;
  disabled?: boolean;
  width: number;
}) {
  const { colors } = useTheme();
  const pair = colors.tones[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width,
          height: Math.round(width * 0.68),
          borderRadius: 18,
          backgroundColor: pair.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} color={pair.fg} size={Math.round(width * 0.36)} />
      </View>
      <Label
        numberOfLines={2}
        style={{ fontSize: 13, lineHeight: 17, fontWeight: "600", textAlign: "center" }}
      >
        {title}
      </Label>
    </Pressable>
  );
}
/** Icon disc, title, detail and a chevron: list rows that go somewhere. */
export function RowCard({
  title,
  detail,
  icon,
  tone = "blue",
  onPress,
  trailing,
  disabled,
  style,
}: {
  title: string;
  detail?: string;
  icon: IconName;
  tone?: Tone;
  onPress?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const pair = colors.tones[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: pair.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} color={pair.fg} size={23} />
      </View>
      <View style={{ flex: 1 }}>
        <Label numberOfLines={1} style={{ fontWeight: "700", fontSize: 15 }}>
          {title}
        </Label>
        {detail ? (
          <Label numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: colors.secondary }}>
            {detail}
          </Label>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.secondary} /> : null)}
    </Pressable>
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
    <View style={[styles.header, { marginTop: 24, marginBottom: 14 }]}>
      <Label
        accessibilityRole="header"
        style={{ fontSize: 20, fontWeight: "700", letterSpacing: -0.4, flex: 1 }}
      >
        {title}
      </Label>
      {action && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <Label style={{ color: colors.blue, fontSize: 14, fontWeight: "600" }}>{action}</Label>
          <Icon name="chevron-forward" size={16} />
        </Pressable>
      )}
    </View>
  );
}
export function EmptyState({
  title = "Nothing here yet",
  description = "Scan a page or import a PDF to get started.",
  action,
  art,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** Illustration shown above the title; a folder icon otherwise. */
  art?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
      {art ?? (
        <View style={{ padding: 18, backgroundColor: colors.tint, borderRadius: 22 }}>
          <Icon name="folder-open-outline" size={34} />
        </View>
      )}
      <Label style={{ fontWeight: "700", fontSize: 18, marginTop: 4 }}>{title}</Label>
      <Label
        style={{
          color: colors.secondary,
          textAlign: "center",
          maxWidth: 280,
          fontSize: 14,
        }}
      >
        {description}
      </Label>
      {action ? <View style={{ marginTop: 6, width: "100%" }}>{action}</View> : null}
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
                borderRadius: 14,
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
          <Label style={{ fontSize: 12, color: colors.secondary }}>{detail}</Label>
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
    marginBottom: 20,
    gap: 12,
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  iconAction: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  card: { borderWidth: 1, borderRadius: 20, padding: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
});
