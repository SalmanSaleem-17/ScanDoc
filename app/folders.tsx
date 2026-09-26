import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  IconAction,
  IconButton,
  Label,
  Screen,
} from "../src/components/ui";
import { FolderArt } from "../src/components/art";
import { useTheme } from "../src/theme/provider";
import { useDocuments } from "../src/features/documents/provider";
import { DocumentCard } from "../src/features/documents/DocumentCard";
import { PinGate, usePinExists, type PinMode } from "../src/features/documents/PinGate";
import {
  createFolder,
  deleteFolder,
  folderChildren,
  renameFolder,
  setFolderLocked,
  type FolderChild,
} from "../src/services/folders";
import { isLockedPath, nameOf, parentOf, segments } from "../src/services/folderPaths.mjs";
import { lockNow } from "../src/services/pin";

// The folder browser: one level at a time, like a file manager. A folder can
// hold sub-folders and documents; Study/Math, Land, Personal. Locking a
// folder hides everything inside it (and below it) until the PIN is entered
// in this session.
export default function Folders() {
  const { path: raw } = useLocalSearchParams<{ path?: string }>();
  const path = segments(raw ?? "").join("/");
  const { colors } = useTheme();
  const { documents, allDocuments, folderOf, lockedPaths, unlocked, refresh, isLocked } = useDocuments();
  const [children, setChildren] = useState<FolderChild[]>([]);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState<{ mode: PinMode; then: () => void } | null>(null);
  const pinExists = usePinExists(pin);
  const crumbs = segments(path);
  const here = crumbs.length ? nameOf(path) : "Folders";
  const lockedHere = !!path && isLockedPath(path, lockedPaths);
  const thisLocked = !!path && lockedPaths.some((p) => p.toLowerCase() === path.toLowerCase());
  const load = useCallback(() => {
    const trashed = new Set(allDocuments.filter((d) => d.trashedAt).map((d) => d.id));
    void folderChildren(path, trashed).then(setChildren).catch(() => setChildren([]));
  }, [path, allDocuments]);
  useFocusEffect(load);
  useEffect(load, [load]);
  // A locked folder opened directly asks for the PIN, and shows nothing until
  // it is given.
  useEffect(() => {
    if (lockedHere && !unlocked && !pin) setPin({ mode: "unlock", then: () => {} });
  }, [lockedHere, unlocked, pin]);
  const inside = documents.filter(
    (d) => !d.trashedAt && (folderOf[d.id] ?? "").toLowerCase() === path.toLowerCase() && path,
  );
  async function act(work: () => Promise<unknown>, failure: string) {
    try {
      await work();
      await refresh();
      load();
    } catch (e) {
      Alert.alert(failure, e instanceof Error ? e.message : "Try again.");
    }
  }
  function toggleLock() {
    if (thisLocked) {
      const proceed = () => void act(() => setFolderLocked(path, false), "Could not unlock the folder");
      if (unlocked) proceed();
      else setPin({ mode: "unlock", then: proceed });
      return;
    }
    const lockIt = () => void act(() => setFolderLocked(path, true), "Could not lock the folder");
    if (pinExists) {
      if (unlocked) lockIt();
      else setPin({ mode: "unlock", then: lockIt });
    } else
      Alert.alert(
        "Lock this folder with a PIN",
        `Everything in ${here} (and its sub-folders) will be hidden until the PIN is entered. You will choose a ${6}-digit PIN next. Do not forget it: it cannot be recovered.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Choose PIN", onPress: () => setPin({ mode: "setup", then: lockIt }) },
        ],
      );
  }
  const blocked = lockedHere && !unlocked;
  return (
    <Screen scroll={false}>
      <Header
        title={here}
        subtitle={
          crumbs.length
            ? `${crumbs.slice(0, -1).join(" › ") || "All folders"}${thisLocked ? " · locked" : ""}`
            : "Keep the same kind of document together."
        }
        action={
          <View style={{ flexDirection: "row" }}>
            {crumbs.length > 0 && (
              <IconButton
                name="arrow-back-outline"
                label="Up one level"
                onPress={() => router.replace({ pathname: "/folders", params: { path: parentOf(path) } })}
              />
            )}
            <IconButton name="close-outline" label="Back" onPress={() => router.back()} />
          </View>
        }
      />
      {blocked ? (
        <EmptyState
          title="This folder is locked"
          description="Enter your PIN to see what is inside."
          action={<Button title="Unlock" icon="lock-open-outline" onPress={() => setPin({ mode: "unlock", then: () => {} })} />}
        />
      ) : (
        <>
          {(creating || renaming) && (
            <Card style={{ gap: 10, marginBottom: 12, padding: 14 }}>
              <Label style={{ fontWeight: "600", fontSize: 13 }}>
                {renaming ? `Rename ${here}` : crumbs.length ? `New folder inside ${here}` : "New folder"}
              </Label>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  accessibilityLabel="Folder name"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  maxLength={40}
                  autoCapitalize="words"
                  placeholder={crumbs.length ? "Math, Science…" : "Study, Land, Personal…"}
                  placeholderTextColor={colors.secondary}
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
                  title={renaming ? "Rename" : "Create"}
                  disabled={!name.trim()}
                  onPress={() => {
                    const value = name;
                    setCreating(false);
                    setRenaming(false);
                    setName("");
                    if (renaming)
                      void act(async () => {
                        const next = await renameFolder(path, value);
                        router.replace({ pathname: "/folders", params: { path: next } });
                      }, "Could not rename the folder");
                    else void act(() => createFolder(path, value), "Could not create the folder");
                  }}
                />
                <IconButton
                  plain
                  name="close-outline"
                  label="Cancel"
                  onPress={() => {
                    setCreating(false);
                    setRenaming(false);
                    setName("");
                  }}
                />
              </View>
            </Card>
          )}
          <FlatList
            data={children}
            keyExtractor={(f) => f.path}
            ListHeaderComponent={
              children.length ? (
                <Label style={{ fontSize: 12, color: colors.secondary, marginBottom: 8 }}>Folders</Label>
              ) : null
            }
            renderItem={({ item }) => {
              const locked = isLockedPath(item.path, lockedPaths);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open folder ${item.name}`}
                  onPress={() => router.push({ pathname: "/folders", params: { path: item.path } })}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 8 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: locked ? colors.tones.orange.bg : colors.tint,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={locked ? "lock-closed" : "folder"} color={locked ? colors.tones.orange.fg : colors.blue} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label style={{ fontWeight: "600", fontSize: 15 }}>{item.name}</Label>
                      <Label style={{ fontSize: 12, color: colors.secondary }}>
                        {locked && !unlocked
                          ? "Locked · enter PIN to open"
                          : `${item.total} ${item.total === 1 ? "document" : "documents"}${item.total !== item.direct ? ` · ${item.direct} here` : ""}`}
                      </Label>
                    </View>
                    <Icon name="chevron-forward" size={18} color={colors.secondary} />
                  </Card>
                </Pressable>
              );
            }}
            ListFooterComponent={
              <View>
                {inside.length > 0 && (
                  <Label style={{ fontSize: 12, color: colors.secondary, marginTop: 8, marginBottom: 8 }}>
                    {`Documents in ${here}`}
                  </Label>
                )}
                {inside.map((document) => (
                  <DocumentCard key={document.id} document={document} />
                ))}
                {!children.length && !inside.length && !creating && (
                  <EmptyState
                    art={<FolderArt />}
                    title={crumbs.length ? `${here} is empty` : "No folders yet"}
                    description={
                      crumbs.length
                        ? "Add a sub-folder, or move documents here from Documents (long-press to select, then Folder)."
                        : "Create folders like Study, Land or Personal, then sub-folders such as Study › Math. Lock a folder with a PIN to keep it private."
                    }
                  />
                )}
                <View style={{ height: 12 }} />
              </View>
            }
          />
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
            <IconAction
              name="add-outline"
              title={crumbs.length ? "Sub-folder" : "New folder"}
              onPress={() => {
                setRenaming(false);
                setName("");
                setCreating(true);
              }}
            />
            {crumbs.length > 0 && (
              <>
                <IconAction
                  name="pencil-outline"
                  title="Rename"
                  onPress={() => {
                    setCreating(false);
                    setName(here);
                    setRenaming(true);
                  }}
                />
                <IconAction
                  name={thisLocked ? "lock-open-outline" : "lock-closed-outline"}
                  title={thisLocked ? "Unlock" : "Lock"}
                  onPress={toggleLock}
                />
                <IconAction
                  name="trash-outline"
                  title="Delete"
                  destructive
                  onPress={() =>
                    Alert.alert(
                      `Delete folder ${here}?`,
                      `Documents inside move to ${crumbs.length > 1 ? crumbs[crumbs.length - 2] : "no folder"}; nothing is deleted.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete folder",
                          style: "destructive",
                          onPress: () =>
                            void act(async () => {
                              await deleteFolder(path);
                              router.replace({ pathname: "/folders", params: { path: parentOf(path) } });
                            }, "Could not delete the folder"),
                        },
                      ],
                    )
                  }
                />
              </>
            )}
            {crumbs.length === 0 && unlocked && lockedPaths.length > 0 && (
              <IconAction name="lock-closed-outline" title="Lock now" onPress={lockNow} />
            )}
          </View>
        </>
      )}
      <PinGate
        visible={pin !== null}
        mode={pin?.mode ?? "unlock"}
        onDone={() => {
          const then = pin?.then;
          setPin(null);
          then?.();
        }}
        onClose={() => {
          setPin(null);
          if (blocked) router.back();
        }}
      />
    </Screen>
  );
}
