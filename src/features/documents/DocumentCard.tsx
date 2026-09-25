import { Pressable, View, Image } from "react-native";
import { router } from "expo-router";
import { Card, Icon, Label } from "../../components/ui";
import { useTheme } from "../../theme/provider";
import { usePreview } from "./thumbnails";
import { formatBytes } from "../../utils/files.mjs";
import type { LocalDocument } from "../../types/document";

export function DocumentCard({
  document,
  selecting = false,
  selected = false,
  onToggle,
  onLongPress,
}: {
  document: LocalDocument;
  /** A selection is in progress: taps select instead of opening. */
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const preview = usePreview(document);
  const open = () =>
    router.push({ pathname: "/document/[id]", params: { id: document.id } });
  return (
    <Pressable
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityLabel={selecting ? document.name : `Open ${document.name}`}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityHint={
        onLongPress && !selecting ? "Long press to select" : undefined
      }
      onPress={selecting ? onToggle : open}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          marginBottom: 10,
          padding: 14,
          borderColor: selected ? colors.blue : colors.border,
          backgroundColor: selected ? colors.tint : colors.surface,
        }}
      >
        <View
          style={{
            width: 46,
            height: 58,
            backgroundColor: colors.tint,
            borderRadius: 8,
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          {preview ? (
            <Image
              source={{ uri: preview }}
              resizeMode="cover"
              style={{ width: 46, height: 58 }}
            />
          ) : (
            <Icon name="document-text-outline" size={26} />
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Label numberOfLines={1} style={{ fontWeight: "600", fontSize: 14 }}>
            {document.name}
          </Label>
          <Label style={{ color: colors.secondary, fontSize: 12 }}>
            {document.kind.toUpperCase()}
            {document.pageCount && document.pageCount > 1
              ? ` · ${document.pageCount} pages`
              : ""}{" "}
            · {formatBytes(document.size)} ·{" "}
            {new Date(document.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </Label>
        </View>
        {selecting ? (
          <Icon
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={selected ? colors.blue : colors.secondary}
          />
        ) : (
          <Icon name="chevron-forward" size={17} color={colors.secondary} />
        )}
      </Card>
    </Pressable>
  );
}
