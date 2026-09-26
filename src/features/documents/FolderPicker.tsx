import { useCallback, useEffect, useState } from "react";
import { BackHandler, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Header, Icon, IconButton, Label } from "../../components/ui";
import { useTheme } from "../../theme/provider";
import { createFolder, folderChildren, type FolderChild } from "../../services/folders";
import { isLockedPath, nameOf, parentOf, segments } from "../../services/folderPaths.mjs";
import { useDocuments } from "./provider";
import { PinGate } from "./PinGate";

/**
 * Chooses a folder for one or more documents by browsing the tree: open a
 * folder to see its sub-folders, "Put here" to choose the one being viewed,
 * or type a name to create a sub-folder at the current level. Locked folders
 * ask for the PIN before they can be opened or chosen.
 */
export function FolderPicker({
  visible,
  current,
  count = 1,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current?: string | null;
  count?: number;
  onSelect: (folder: string | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { allDocuments, lockedPaths, unlocked, refresh } = useDocuments();
  const [path, setPath] = useState("");
  const [children, setChildren] = useState<FolderChild[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pinFor, setPinFor] = useState<string | null>(null);
  const trashed = new Set(allDocuments.filter((d) => d.trashedAt).map((d) => d.id));
  const load = useCallback(
    (at: string) => {
      void folderChildren(at, trashed)
        .then(setChildren)
        .catch(() => setChildren([]));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allDocuments],
  );
  useEffect(() => {
    if (!visible) return;
    const start = current ? parentOf(current) : "";
    setPath(start);
    setDraft("");
    setError("");
    load(start);
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (segments(path).length) setPath(parentOf(path));
      else onClose();
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (visible) load(path);
  }, [path, visible, load]);
  if (!visible) return null;
  const locked = (p: string) => isLockedPath(p, lockedPaths) && !unlocked;
  const what = count === 1 ? "this document" : `${count} documents`;
  const crumbs = segments(path);
  function open(p: string) {
    if (locked(p)) {
      setPinFor(p);
      return;
    }
    setPath(p);
  }
  function choose(p: string | null) {
    if (p && locked(p)) {
      setPinFor(p);
      return;
    }
    onSelect(p);
  }
  async function create() {
    try {
      const created = await createFolder(path, draft);
      setDraft("");
      setError("");
      await refresh();
      load(path);
      setPath(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the folder.");
    }
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <SafeAreaView style={{ flex: 1, padding: 20 }} edges={["top", "bottom", "left", "right"]}>
        <Header
          title={crumbs.length ? nameOf(path) : "Choose a folder"}
          subtitle={crumbs.length ? `In ${crumbs.slice(0, -1).join(" › ") || "All folders"} · where ${what} should live` : `Where ${what} should live.`}
          action={
            <View style={{ flexDirection: "row" }}>
              {crumbs.length > 0 && (
                <IconButton name="arrow-back-outline" label="Up one level" onPress={() => setPath(parentOf(path))} />
              )}
              <IconButton name="close-outline" label="Close" onPress={onClose} />
            </View>
          }
        />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={crumbs.length ? `Put here: ${nameOf(path)}` : "No folder"}
              icon={crumbs.length ? "folder-open-outline" : "albums-outline"}
              onPress={() => choose(crumbs.length ? path : null)}
            />
          </View>
        </View>
        <Card style={{ gap: 8, marginBottom: 12, padding: 12 }}>
          <Label style={{ fontWeight: "600", fontSize: 13 }}>
            {crumbs.length ? `New folder inside ${nameOf(path)}` : "New folder"}
          </Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              accessibilityLabel="New folder name"
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                setError("");
              }}
              placeholder={crumbs.length ? "Math, Science…" : "Study, Land, Personal…"}
              placeholderTextColor={colors.secondary}
              maxLength={40}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => void create()}
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
            <Button title="Create" secondary disabled={!draft.trim()} onPress={() => void create()} />
          </View>
          {!!error && <Label style={{ fontSize: 12, color: colors.danger }}>{error}</Label>}
        </Card>
        <FlatList
          data={children}
          keyExtractor={(f) => f.path}
          renderItem={({ item }) => {
            const isLocked = isLockedPath(item.path, lockedPaths);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.name}`}
                onPress={() => open(item.path)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Card
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderColor: current === item.path ? colors.blue : colors.border,
                  }}
                >
                  <Icon name={isLocked ? "lock-closed-outline" : "folder-outline"} color={isLocked ? colors.tones.orange.fg : colors.blue} />
                  <View style={{ flex: 1 }}>
                    <Label style={{ fontWeight: "600", fontSize: 14 }}>{item.name}</Label>
                    <Label style={{ fontSize: 12, color: colors.secondary }}>
                      {`${item.total} ${item.total === 1 ? "document" : "documents"}${isLocked ? " · locked" : ""}`}
                    </Label>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Put ${what} in ${item.name}`}
                    onPress={() => choose(item.path)}
                    hitSlop={8}
                    style={{ paddingHorizontal: 10, minHeight: 40, justifyContent: "center", borderRadius: 12, backgroundColor: colors.tint }}
                  >
                    <Label style={{ color: colors.blue, fontSize: 13, fontWeight: "600" }}>Put here</Label>
                  </Pressable>
                  <Icon name="chevron-forward" size={18} color={colors.secondary} />
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Label style={{ color: colors.secondary, fontSize: 13, marginTop: 6 }}>
              {crumbs.length ? "No sub-folders yet." : "No folders yet. Type a name above to create the first one."}
            </Label>
          }
        />
      </SafeAreaView>
      <PinGate
        visible={pinFor !== null}
        mode="unlock"
        onDone={() => {
          const target = pinFor;
          setPinFor(null);
          if (target) setPath(target);
        }}
        onClose={() => setPinFor(null)}
      />
    </View>
  );
}
