import { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, router } from "expo-router";
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  IconAction,
  IconButton,
  Label,
  Loading,
  Screen,
} from "../../src/components/ui";
import { useDocuments } from "../../src/features/documents/provider";
import {
  deleteDocumentForever,
  renameDocument,
  trashDocument,
} from "../../src/services/storage";
import { shareDocument } from "../../src/features/documents/actions";
import { usePreview } from "../../src/features/documents/thumbnails";
import { FOLDER_HINT, exportDirectory, saveToDevice } from "../../src/services/saveToDevice";
import { hasEngine } from "../../src/services/engine";
import { useTheme } from "../../src/theme/provider";
import { formatBytes } from "../../src/utils/files.mjs";
import { daysUntilPurge } from "../../src/services/library.mjs";
import type { LocalDocument } from "../../src/types/document";

// A document is shown the way people think of a scan: one file name, and its
// pages laid out in a numbered grid underneath. Tapping a page opens it full
// screen; the bar at the bottom holds the handful of things done to a file.
export default function Document() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents } = useDocuments();
  const document = documents.find((d) => d.id === id);
  if (!document)
    return (
      <Screen>
        <EmptyState
          title="Document unavailable"
          description="It may have been deleted from another screen."
          action={<Button title="Go back" onPress={() => router.back()} />}
        />
      </Screen>
    );
  return <DocumentView document={document} />;
}

function DocumentView({ document }: { document: LocalDocument }) {
  const { refresh } = useDocuments();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // Screen content is padded 20 on each side and capped at 860 wide.
  const contentWidth = Math.min(width, 860) - 40;
  const cellWidth = (contentWidth - 12) / 2;
  const pages =
    document.kind === "pdf" && hasEngine
      ? Math.max(1, document.pageCount ?? 1)
      : 1;
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch {
      Alert.alert(
        "Could not complete this action",
        "Check the file and available storage, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const details = [
    document.kind.toUpperCase(),
    `${pages} ${pages === 1 ? "page" : "pages"}`,
    formatBytes(document.size),
    new Date(document.updatedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  ].join(" · ");
  const days = document.trashedAt ? daysUntilPurge(document.trashedAt) : 0;
  const header = (
    <View>
      <Header
        title={document.name}
        subtitle={details}
        action={
          <IconButton
            name="close-outline"
            label="Close document"
            onPress={() => router.back()}
          />
        }
      />
      {editing && (
        <Card style={{ gap: 12, marginBottom: 16 }}>
          <TextInput
            accessibilityLabel="Document name"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={100}
            style={{
              color: colors.text,
              borderBottomWidth: 1,
              borderColor: colors.border,
              minHeight: 48,
              fontSize: 16,
            }}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Cancel"
                secondary
                onPress={() => setEditing(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Save"
                disabled={busy || !name.trim()}
                onPress={() =>
                  perform(async () => {
                    await renameDocument(document.id, name);
                    setEditing(false);
                  })
                }
              />
            </View>
          </View>
        </Card>
      )}
      {document.trashedAt ? (
        <Card style={{ gap: 12, marginBottom: 16 }}>
          <Label style={{ color: colors.secondary, fontSize: 13 }}>
            {`In Trash · removed automatically in ${days} ${days === 1 ? "day" : "days"}.`}
          </Label>
          <Button
            title="Restore document"
            icon="refresh-outline"
            disabled={busy}
            onPress={() => perform(() => trashDocument(document.id, true))}
          />
          <Button
            title="Delete forever"
            icon="trash-outline"
            destructive
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Delete forever?",
                "This removes the file and its recognized text from this device. It cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete forever",
                    style: "destructive",
                    onPress: () =>
                      perform(async () => {
                        await deleteDocumentForever(document.id);
                        router.back();
                      }),
                  },
                ],
              )
            }
          />
        </Card>
      ) : null}
    </View>
  );
  // The viewer sits beside the padded screen, not inside it, so it covers the
  // whole display including the status bar area.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <Screen scroll={false}>
      <FlatList
        data={Array.from({ length: pages }, (_, index) => index)}
        keyExtractor={(index) => String(index)}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        ListHeaderComponent={header}
        initialNumToRender={6}
        windowSize={5}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open page ${item + 1}`}
            onPress={() => setViewing(item)}
            style={{ width: cellWidth, marginBottom: 16, alignItems: "center", gap: 6 }}
          >
            <PageImage
              document={document}
              index={item}
              size="grid"
              width={cellWidth}
              height={Math.round(cellWidth * 1.32)}
            />
            <Label style={{ fontSize: 13, color: colors.secondary }}>
              {String(item + 1).padStart(2, "0")}
            </Label>
          </Pressable>
        )}
      />
      {!document.trashedAt && (
        <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
          {document.kind === "pdf" && hasEngine && (
            <IconAction
              name="add-outline"
              title="Add"
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/scanner",
                  params: { appendTo: document.id },
                })
              }
            />
          )}
          <IconAction
            name="share-outline"
            title="Share"
            disabled={busy}
            onPress={() => perform(() => shareDocument(document))}
          />
          <IconAction
            name="download-outline"
            title="Save"
            disabled={busy}
            onPress={async () => {
              if (!(await exportDirectory())) {
                const proceed = await new Promise<boolean>((resolve) =>
                  Alert.alert("Choose a folder", FOLDER_HINT, [
                    { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                    { text: "Choose folder", onPress: () => resolve(true) },
                  ]),
                );
                if (!proceed) return;
              }
              void perform(async () => {
                const outcome = await saveToDevice(document);
                if (outcome.status === "saved")
                  Alert.alert(
                    "Saved to device",
                    `"${outcome.name}" is in your chosen folder. Change the folder in Settings → Storage.`,
                  );
              });
            }}
          />
          <IconAction
            name="pencil-outline"
            title="Rename"
            disabled={busy}
            onPress={() => {
              setName(document.name);
              setEditing(true);
            }}
          />
          <IconAction
            name="trash-outline"
            title="Trash"
            destructive
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Move to Trash?",
                "You can restore it from the Trash filter in Documents.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Move to Trash",
                    style: "destructive",
                    onPress: () =>
                      perform(async () => {
                        await trashDocument(document.id);
                        router.back();
                      }),
                  },
                ],
              )
            }
          />
        </View>
      )}
    </Screen>
      {viewing !== null && (
        <PageViewer
          document={document}
          pages={pages}
          initial={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </View>
  );
}

// One rendered page (or the image itself), drawn only when it scrolls into
// view; the render is cached per page and size by usePreview.
function PageImage({
  document,
  index,
  size,
  width,
  height,
  dark = false,
}: {
  document: LocalDocument;
  index: number;
  size: "grid" | "page";
  width: number;
  height: number;
  dark?: boolean;
}) {
  const { colors } = useTheme();
  const uri = usePreview(document, size, index);
  const frame = {
    width,
    height,
    borderRadius: dark ? 0 : 10,
    backgroundColor: dark ? "#000000" : colors.border,
  };
  if (uri)
    return (
      <Image
        source={{ uri }}
        resizeMode="contain"
        accessibilityLabel={
          document.kind === "pdf" ? `Page ${index + 1}` : "Document image"
        }
        style={frame}
      />
    );
  return (
    <View
      style={{
        ...frame,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {document.kind === "pdf" && hasEngine ? (
        <Loading text={size === "grid" ? "" : `Rendering page ${index + 1}…`} />
      ) : (
        <>
          <Icon name="document-text-outline" size={44} />
          {size === "page" && (
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              Share to open in a PDF reader.
            </Label>
          )}
        </>
      )}
    </View>
  );
}

// Full-screen page viewer drawn inside the app's own window (no Modal, so the
// status bar keeps behaving), swiping between pages, closed by the back
// gesture or the close button.
function PageViewer({
  document,
  pages,
  initial,
  onClose,
}: {
  document: LocalDocument;
  pages: number;
  initial: number;
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  // Pages are sized to the overlay itself, measured once it is laid out.
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const { width, height } = size;
  const [page, setPage] = useState(initial);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose]);
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: "#000000" }]}
      onLayout={(event) => {
        const { width: w, height: h } = event.nativeEvent.layout;
        if (w && h && (w !== size.width || h !== size.height))
          setSize({ width: w, height: h });
      }}
    >
      <StatusBar style="light" />
      <FlatList
        key={width}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={Array.from({ length: pages }, (_, index) => index)}
        keyExtractor={(index) => String(index)}
        initialScrollIndex={initial}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        initialNumToRender={1}
        windowSize={3}
        renderItem={({ item }) => (
          <PageImage
            document={document}
            index={item}
            size="page"
            width={width}
            height={height}
            dark
          />
        )}
      />
      <SafeAreaView
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { justifyContent: "space-between" }]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 8,
            backgroundColor: "#00000088",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close page view"
            onPress={onClose}
            style={{ minWidth: 56, minHeight: 52, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="close" color="white" />
          </Pressable>
          <Label style={{ color: "white", fontWeight: "600" }} numberOfLines={1}>
            {document.name}
          </Label>
          <View style={{ minWidth: 56 }} />
        </View>
        <Label
          accessibilityLiveRegion="polite"
          style={{
            color: "white",
            textAlign: "center",
            fontSize: 13,
            paddingVertical: 12,
            backgroundColor: "#00000088",
          }}
        >
          {`${page + 1} / ${pages}`}
        </Label>
      </SafeAreaView>
    </View>
  );
}
