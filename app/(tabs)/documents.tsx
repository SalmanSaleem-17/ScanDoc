import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Button,
  EmptyState,
  Header,
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
export default function Documents() {
  const { colors } = useTheme();
  const { documents, loading, error, refresh } = useDocuments();
  const { importDocuments, progress } = useImport();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState<"Recent" | "Name" | "Largest">("Recent");
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [indexRevision, setIndexRevision] = useState(0);
  const [indexError, setIndexError] = useState("");
  useFocusEffect(
    useCallback(() => {
      setIndexRevision(value => value + 1);
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
            (filter === "Trash" ? !!d.trashedAt : !d.trashedAt) &&
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
    [documents, query, filter, sort, matches, folderMap],
  );
  return (
    <Screen tabScreen scroll={false}>
      <Header
        title="Documents"
        subtitle={`${documents.filter((d) => !d.trashedAt).length} files · On this device`}
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
        placeholder="Search names, folders & recognized text"
      />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 16 }}
        >
          {["All", "PDF", "Scans", "Images", "Trash"].map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item }}
              onPress={() => setFilter(item)}
              style={{
                paddingHorizontal: 17,
                minHeight: 44,
                justifyContent: "center",
                borderRadius: 22,
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
      </View>
      {!!indexError && <Label>{indexError}</Label>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${sort}. Tap to change.`}
        onPress={() =>
          setSort(
            sort === "Recent" ? "Name" : sort === "Name" ? "Largest" : "Recent",
          )
        }
        style={{
          minHeight: 44,
          justifyContent: "center",
          alignSelf: "flex-end",
        }}
      >
        <Label style={{ fontSize: 12, color: colors.secondary }}>
          Sort: {sort} ↕
        </Label>
      </Pressable>
      {progress && <Loading text={progress} />}
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
          renderItem={({ item }) => (
            <View>
              <DocumentCard document={item} />
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
                  : filter === "Trash"
                    ? "Your trash is empty"
                    : "No documents yet"
              }
              description={
                query
                  ? "Try another word. Run OCR to make a scan searchable."
                  : filter === "Trash"
                    ? "Deleted files appear here and can be restored."
                    : "Scan or import your first document."
              }
            />
          }
        />
      )}
    </Screen>
  );
}
