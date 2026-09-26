import { useEffect, useState } from "react";
import {
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Header, Icon, IconButton, Label } from "../../components/ui";
import { useTheme } from "../../theme/provider";
import {
  cleanFolderName,
  folderSummary,
  type FolderSummary,
} from "../../services/workspace";

/**
 * Chooses a folder for one or more documents: an existing one, a new name, or
 * none. Drawn as an overlay inside the app's own window rather than a Modal,
 * for the same status-bar reason as the document picker. Folders only exist
 * while a document is in them, so "new" here simply means a name that no
 * document carries yet.
 */
export function FolderPicker({
  visible,
  current,
  count = 1,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** The folder the document is in now, if any. */
  current?: string | null;
  /** How many documents are being moved; only affects wording. */
  count?: number;
  onSelect: (folder: string | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (!visible) return;
    setDraft("");
    void folderSummary().then(setFolders).catch(() => setFolders([]));
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);
  if (!visible) return null;
  const proposed = cleanFolderName(draft);
  const exists = folders.some((f) => f.folder.toLowerCase() === proposed.toLowerCase());
  const what = count === 1 ? "this document" : `${count} documents`;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <SafeAreaView style={{ flex: 1, padding: 20 }} edges={["top", "bottom", "left", "right"]}>
        <Header
          title="Choose a folder"
          subtitle={`Where ${what} should live.`}
          action={<IconButton name="close-outline" label="Close" onPress={onClose} />}
        />
        <Card style={{ gap: 10, marginBottom: 14, padding: 14 }}>
          <Label style={{ fontWeight: "600", fontSize: 13 }}>New folder</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              accessibilityLabel="New folder name"
              value={draft}
              onChangeText={setDraft}
              placeholder="Invoices, Contracts, School…"
              placeholderTextColor={colors.secondary}
              maxLength={40}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => proposed && onSelect(proposed)}
              style={{
                flex: 1,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                minHeight: 46,
                backgroundColor: colors.background,
              }}
            />
            <Button
              title={exists ? "Move" : "Create"}
              disabled={!proposed}
              onPress={() => onSelect(proposed)}
            />
          </View>
        </Card>
        <FlatList
          data={folders}
          keyExtractor={(f) => f.folder}
          ListHeaderComponent={
            <FolderRow
              icon="albums-outline"
              title="No folder"
              detail="Shown only in All documents"
              selected={!current}
              onPress={() => onSelect(null)}
            />
          }
          renderItem={({ item }) => (
            <FolderRow
              icon="folder-outline"
              title={item.folder}
              detail={`${item.count} ${item.count === 1 ? "document" : "documents"}`}
              selected={current === item.folder}
              onPress={() => onSelect(item.folder)}
            />
          )}
          ListEmptyComponent={
            <Label style={{ color: colors.secondary, fontSize: 13, marginTop: 6 }}>
              No folders yet. Type a name above to create the first one.
            </Label>
          }
        />
      </SafeAreaView>
    </View>
  );
}

function FolderRow({
  icon,
  title,
  detail,
  selected,
  onPress,
}: {
  icon: "folder-outline" | "albums-outline";
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          marginBottom: 8,
          borderColor: selected ? colors.blue : colors.border,
          backgroundColor: selected ? colors.tint : colors.surface,
        }}
      >
        <Icon name={icon} color={selected ? colors.blue : colors.secondary} />
        <View style={{ flex: 1 }}>
          <Label style={{ fontWeight: "600", fontSize: 14 }}>{title}</Label>
          <Label style={{ fontSize: 12, color: colors.secondary }}>{detail}</Label>
        </View>
        {selected && <Icon name="checkmark-circle" size={22} />}
      </Card>
    </Pressable>
  );
}
