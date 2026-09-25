import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
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
  SearchBar,
} from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
import { useDocuments } from "../../src/features/documents/provider";
import { DocumentCard } from "../../src/features/documents/DocumentCard";
import { useImport } from "../../src/features/documents/useImport";
import { searchText, folders } from "../../src/services/workspace";
import {
  deleteDocumentForever,
  emptyTrash,
  forEachDocument,
  trashDocument,
} from "../../src/services/storage";
import { TRASH_RETENTION_DAYS } from "../../src/services/library.mjs";
import { FOLDER_HINT, exportDirectory, saveToDevice } from "../../src/services/saveToDevice";

type Sort = "Recent" | "Name" | "Largest";
const SORTS: Sort[] = ["Recent", "Name", "Largest"];
const SORT_KEY = "documents.sort";
const TIP_KEY = "tips.multiselect";
const FILTERS = ["All", "PDF", "Scans", "Images", "Trash"] as const;

export default function Documents() {
  const { colors } = useTheme();
  const { documents, loading, error, refresh } = useDocuments();
  const { importDocuments, progress } = useImport();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<Sort>("Recent");
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [indexRevision, setIndexRevision] = useState(0);
  const [indexError, setIndexError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Long-pressing a document starts a selection; the order of selection is
  // kept because it becomes the page order when the files are merged.
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState("");
  // Long-press is not discoverable on its own; one line says so until it has
  // been used once.
  const [tipSeen, setTipSeen] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(TIP_KEY)
      .then((value) => setTipSeen(value === "1"))
      .catch(() => {});
  }, []);
  const selecting = selected.length > 0;
  const inTrash = filter === "Trash";

  useEffect(() => {
    AsyncStorage.getItem(SORT_KEY)
      .then((value) => {
        if (SORTS.includes(value as Sort)) setSort(value as Sort);
      })
      .catch(() => {});
  }, []);
  function cycleSort() {
    const next = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length];
    setSort(next);
    void AsyncStorage.setItem(SORT_KEY, next).catch(() => {});
  }

  // A selection belongs to the list it was made in.
  useEffect(() => setSelected([]), [filter]);
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setSelected([]);
        return true;
      },
    );
    return () => subscription.remove();
  }, [selecting]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      setIndexRevision((value) => value + 1);
    } finally {
      setRefreshing(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      setIndexRevision((value) => value + 1);
      void folders()
        .then((rows) =>
          setFolderMap(
            Object.fromEntries(rows.map((row) => [row.documentId, row.folder])),
          ),
        )
        .catch(() => setIndexError("Folder search is unavailable."));
    }, []),
  );
  useEffect(() => {
    let active = true;
    setMatches({});
    const timer = setTimeout(() => {
      void searchText(query)
        .then((rows) => {
          if (active) {
            setMatches(
              Object.fromEntries(
                rows.map((row) => [row.documentId, row.excerpt]),
              ),
            );
            setIndexError("");
          }
        })
        .catch(() => {
          if (active)
            setIndexError("Text index unavailable. Searching filenames only.");
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, indexRevision]);
  const visible = useMemo(
    () =>
      documents
        .filter(
          (d) =>
            (inTrash ? !!d.trashedAt : !d.trashedAt) &&
            (filter !== "PDF" || d.kind === "pdf") &&
            (filter !== "Images" || d.kind === "image") &&
            (filter !== "Scans" || d.source === "camera") &&
            (`${d.name} ${d.kind} ${folderMap[d.id] || ""}`
              .toLowerCase()
              .includes(query.toLowerCase()) ||
              !!matches[d.id]),
        )
        .sort((a, b) =>
          sort === "Name"
            ? a.name.localeCompare(b.name)
            : sort === "Largest"
              ? b.size - a.size
              : b.updatedAt - a.updatedAt,
        ),
    [documents, query, filter, inTrash, sort, matches, folderMap],
  );

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function beginSelection(id: string) {
    void Haptics.selectionAsync().catch(() => {});
    if (!tipSeen) {
      setTipSeen(true);
      void AsyncStorage.setItem(TIP_KEY, "1").catch(() => {});
    }
    setSelected((current) => (current.includes(id) ? current : [...current, id]));
  }
  async function applyToSelection(
    verb: string,
    action: (id: string) => Promise<unknown>,
  ) {
    if (working) return;
    const ids = [...selected];
    setWorking(`${verb} ${ids.length} ${ids.length === 1 ? "document" : "documents"}…`);
    const failed = await forEachDocument(ids, action);
    setWorking("");
    setSelected([]);
    await refresh();
    if (failed.length)
      Alert.alert(
        "Some documents were skipped",
        `${failed.length} of ${ids.length} could not be changed. Try again in a moment.`,
      );
  }
  async function saveSelection() {
    if (working) return;
    const chosen = selected
      .map((id) => documents.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d);
    let saved = 0;
    let failed = 0;
    // First time only: say what the folder picker will and will not accept.
    if (!(await exportDirectory())) {
      const proceed = await new Promise<boolean>((resolve) =>
        Alert.alert("Choose a folder", FOLDER_HINT, [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Choose folder", onPress: () => resolve(true) },
        ]),
      );
      if (!proceed) return;
    }
    setWorking(`Saving ${chosen.length} ${chosen.length === 1 ? "document" : "documents"}…`);
    try {
      for (const document of chosen) {
        try {
          const outcome = await saveToDevice(document);
          if (outcome.status === "cancelled") break;
          saved++;
        } catch {
          failed++;
        }
      }
    } finally {
      setWorking("");
    }
    if (saved) setSelected([]);
    if (saved || failed)
      Alert.alert(
        failed ? "Saved with problems" : "Saved to device",
        `${saved} saved to your export folder${failed ? `, ${failed} could not be written` : ""}. Change the folder in Settings → Storage.`,
      );
  }
  function confirmSelection(
    title: string,
    message: string,
    button: string,
    action: (id: string) => Promise<unknown>,
  ) {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: button,
        style: "destructive",
        onPress: () => void applyToSelection(button, action),
      },
    ]);
  }
  function confirmEmptyTrash() {
    Alert.alert(
      "Empty trash?",
      "Every document in the Trash is deleted from this device, along with its recognized text. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty trash",
          style: "destructive",
          onPress: () =>
            void emptyTrash()
              .then(() => refresh())
              .catch(() =>
                Alert.alert(
                  "Could not empty the trash",
                  "Some files may still be in use. Try again in a moment.",
                ),
              ),
        },
      ],
    );
  }

  const count = selected.length;
  const plural = count === 1 ? "document" : "documents";
  return (
    <Screen tabScreen scroll={false}>
      {selecting ? (
        <Header
          title={`${count} selected`}
          action={
            <View style={{ flexDirection: "row" }}>
              {count < visible.length && (
                <IconButton
                  name="checkmark-done-outline"
                  label="Select all"
                  onPress={() => setSelected(visible.map((d) => d.id))}
                />
              )}
              <IconButton
                name="close-outline"
                label="Cancel selection"
                onPress={() => setSelected([])}
              />
            </View>
          }
        />
      ) : (
        <>
          <Header
            title="Documents"
            action={
              <IconButton
                name="add-outline"
                label="Import documents"
                onPress={importDocuments}
              />
            }
          />
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search names, folders & text"
          />
        </>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 14 }}
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
            onPress={() => setFilter(item)}
            style={{
              paddingHorizontal: 17,
              minHeight: 40,
              justifyContent: "center",
              borderRadius: 20,
              backgroundColor: filter === item ? colors.blue : colors.surface,
            }}
          >
            <Label
              style={{
                fontSize: 13,
                color: filter === item ? colors.background : colors.secondary,
              }}
            >
              {item}
            </Label>
          </Pressable>
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Label style={{ fontSize: 13, color: colors.secondary }}>
          {`${visible.length} ${visible.length === 1 ? "file" : "files"}${indexError ? ` · ${indexError}` : ""}`}
        </Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${sort.toLowerCase()}. Change sort order`}
          onPress={cycleSort}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            minHeight: 40,
            paddingHorizontal: 6,
          }}
        >
          <Icon name="swap-vertical-outline" size={16} />
          <Label style={{ fontSize: 13, color: colors.blue }}>{sort}</Label>
        </Pressable>
      </View>
      {!selecting && !tipSeen && visible.length >= 2 && (
        <Label style={{ fontSize: 12, color: colors.secondary, marginBottom: 10 }}>
          Tip: long-press a document to select several.
        </Label>
      )}
      {inTrash && !selecting && (
        <Card style={{ marginBottom: 12, gap: 10, padding: 14 }}>
          <Label style={{ fontSize: 13, color: colors.secondary }}>
            {`Items in Trash are removed after ${TRASH_RETENTION_DAYS} days. Long press to restore several at once.`}
          </Label>
          {documents.some((d) => d.trashedAt) && (
            <Button
              title="Empty trash"
              icon="trash-outline"
              destructive
              onPress={confirmEmptyTrash}
            />
          )}
        </Card>
      )}
      {progress && <Loading text={progress} />}
      {working && <Loading text={working} />}
      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState
          title="Library unavailable"
          description={error}
          action={<Button title="Try again" onPress={refresh} />}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d.id}
          extraData={selected}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.blue}
              colors={[colors.blue]}
            />
          }
          renderItem={({ item }) => (
            <View>
              <DocumentCard
                document={item}
                selecting={selecting}
                selected={selected.includes(item.id)}
                onToggle={() => toggle(item.id)}
                onLongPress={() => beginSelection(item.id)}
              />
              {!!folderMap[item.id] && (
                <Label
                  style={{
                    color: colors.secondary,
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  Folder: {folderMap[item.id]}
                </Label>
              )}
              {!!matches[item.id] && (
                <Label
                  style={{ fontSize: 12, color: colors.blue, marginBottom: 12 }}
                >
                  {matches[item.id]}
                </Label>
              )}
            </View>
          )}
          initialNumToRender={12}
          windowSize={5}
          ListEmptyComponent={
            <EmptyState
              title={
                query
                  ? "No matching documents"
                  : inTrash
                    ? "Your trash is empty"
                    : "No documents yet"
              }
              description={
                query
                  ? "Try another word. Run OCR to make a scan searchable."
                  : inTrash
                    ? "Deleted files appear here and can be restored."
                    : "Scan a page or import a PDF to get started."
              }
            />
          }
        />
      )}
      {selecting && (
        <Card
          style={{
            flexDirection: "row",
            gap: 8,
            padding: 8,
            marginTop: 8,
          }}
        >
          {inTrash ? (
            <>
              <IconAction
                name="refresh-outline"
                title="Restore"
                disabled={!!working}
                onPress={() =>
                  void applyToSelection("Restoring", (id) =>
                    trashDocument(id, true),
                  )
                }
              />
              <IconAction
                name="trash-outline"
                title="Delete forever"
                destructive
                disabled={!!working}
                onPress={() =>
                  confirmSelection(
                    `Delete ${count} ${plural} forever?`,
                    "The files and their recognized text are removed from this device. This cannot be undone.",
                    "Delete forever",
                    deleteDocumentForever,
                  )
                }
              />
            </>
          ) : (
            <>
              <IconAction
                name="git-merge-outline"
                title="Merge PDF"
                disabled={count < 2 || !!working}
                onPress={() => {
                  const ids = selected.join(",");
                  setSelected([]);
                  router.push({ pathname: "/merge", params: { ids } });
                }}
              />
              <IconAction
                name="download-outline"
                title="Save to device"
                disabled={!!working}
                onPress={() => void saveSelection()}
              />
              <IconAction
                name="trash-outline"
                title="Move to Trash"
                destructive
                disabled={!!working}
                onPress={() =>
                  confirmSelection(
                    `Move ${count} ${plural} to Trash?`,
                    `You can restore them from the Trash filter for ${TRASH_RETENTION_DAYS} days.`,
                    "Move to Trash",
                    (id) => trashDocument(id),
                  )
                }
              />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
