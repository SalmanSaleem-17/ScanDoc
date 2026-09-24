import { Pressable, View, Image } from "react-native";
import { router } from "expo-router";
import { Card, Icon, Label } from "../../components/ui";
import { useTheme } from "../../theme/provider";
import { usePreview } from "./thumbnails";
import { formatBytes } from "../../utils/files.mjs";
import type { LocalDocument } from "../../types/document";
export function DocumentCard({ document }: { document: LocalDocument }) {
  const { colors } = useTheme();
  const preview = usePreview(document);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${document.name}`}
      onPress={() =>
        router.push({ pathname: "/document/[id]", params: { id: document.id } })
      }
    >
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          marginBottom: 10,
          padding: 14,
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
            {document.kind.toUpperCase()} · {formatBytes(document.size)} ·{" "}
            {new Date(document.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </Label>
        </View>
        <Icon name="chevron-forward" size={17} color={colors.secondary} />
      </Card>
    </Pressable>
  );
}
