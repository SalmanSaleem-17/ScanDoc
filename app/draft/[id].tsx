import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Image,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Button,
  Card,
  Header,
  Icon,
  IconAction,
  IconButton,
  Label,
  RowCard,
  Screen,
} from "../../src/components/ui";
import { Field, TaskStatus, useTask } from "../../src/features/workflows/components";
import {
  addPage,
  discardDraft,
  getDraft,
  listPages,
  pageUri,
  removePage,
  reorderPages,
  storePdf,
  putFolder,
  saveText,
  type Draft,
  type DraftPage,
} from "../../src/services/workspace";
import {
  hasEngine,
  engineRequirement,
  runEngine,
} from "../../src/services/engine";
import { suggestName } from "../../src/features/workflows/logic.mjs";
import { useDocuments } from "../../src/features/documents/provider";
import { replaceDocumentFile } from "../../src/services/storage";
import { forgetPreviews } from "../../src/features/documents/thumbnails";
import { withRenderedPages } from "../../src/features/pdf/operations";
import { beginSystemFlow } from "../../src/features/ads/systemFlow";
import { useTheme } from "../../src/theme/provider";
import { useAds } from "../../src/features/ads/provider";
import { WATERMARK_TEXT, describeTimeLeft } from "../../src/features/ads/rewards.mjs";

// The draft is shown the way the finished document will be: its name on top
// and the pages as a numbered grid. Tapping a page selects it and brings up
// what can be done to that page (edit, move, remove); the bar at the bottom
// holds what can be done to the draft (add pages, create the PDF).
export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cellWidth = (Math.min(width, 860) - 40 - 12) / 2;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const { documents, refresh } = useDocuments();
  const task = useTask();
  const ads = useAds();
  // Set when this draft was started from a document's "Add" action: finishing
  // it appends the pages to that PDF instead of creating a new file.
  const appendTarget = draft?.appendTo
    ? documents.find((d) => d.id === draft.appendTo && !d.trashedAt)
    : undefined;
  const reload = useCallback(() => {
    void Promise.all([getDraft(id), listPages(id)])
      .then(([d, p]) => {
        setDraft(d);
        setPages(p);
        setName((n) => n || d?.name || "Scan");
      })
      .catch(() => Alert.alert("Could not open draft", "Please try again."));
  }, [id]);
  useFocusEffect(reload);
  // Back clears a page selection before it leaves the screen.
  useEffect(() => {
    if (!selected) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelected(null);
      return true;
    });
    return () => subscription.remove();
  }, [selected]);
  const selectedIndex = pages.findIndex((page) => page.id === selected);
  const selectedPage = selectedIndex >= 0 ? pages[selectedIndex] : null;

  async function exportPdf(
    signal: AbortSignal,
    progress: (text: string) => void,
  ) {
    if (!hasEngine) {
      Alert.alert("Development build required", engineRequirement);
      return;
    }
    const mb = Number(target);
    if (target && (!Number.isFinite(mb) || mb < 0.1 || mb > 500))
      throw new Error("Invalid target");
    const uris = pages.map(pageUri);
    if (draft?.appendTo) {
      if (!appendTarget)
        throw new Error("The document these pages belong to is no longer available.");
      const target = appendTarget;
      await withRenderedPages(
        [{ document: target }],
        signal,
        progress,
        async (existing) => {
          progress("Writing the combined PDF");
          const output = await runEngine(
            "pdf",
            { uris: [...existing, ...uris], watermark: ads.pdfWatermark },
            { signal, progress },
          );
          try {
            if (signal.aborted) throw new Error("Cancelled");
            await replaceDocumentFile(
              target.id,
              output.uri!,
              existing.length + uris.length,
            );
            forgetPreviews(target.id);
            await discardDraft(id);
            await refresh();
            // Back to the document this started from (it is below the scanner
            // and this draft in the stack), so Back does not land on the
            // scanner again.
            router.dismissTo({
              pathname: "/document/[id]",
              params: { id: target.id },
            });
          } finally {
            output.clean();
          }
        },
      );
      return;
    }
    let text = "";
    let title = name;
    if (draft?.preset === "receipt" || draft?.preset === "study") {
      for (let i = 0; i < uris.length; i++) {
        progress(`Reading page ${i + 1} of ${uris.length}`);
        const ocr = await runEngine("ocr", { uri: uris[i] }, { signal });
        try {
          text += `${ocr.text || ""}\n\n`;
        } finally {
          ocr.clean();
        }
      }
      if (draft.preset === "receipt" && text.trim() && name === draft.name) title = suggestName(text);
    }
    const output = await runEngine(
      "pdf",
      { uris, targetBytes: target ? Math.floor(mb * 1024 * 1024) : 0, watermark: ads.pdfWatermark },
      { signal, progress },
    );
    try {
      if (signal.aborted) throw new Error("Cancelled");
      const document = await storePdf(output.uri!, title, pages.length);
      if (text.trim()) await saveText(document.id, text);
      if (draft?.preset === "receipt" || draft?.preset === "study")
        await putFolder(
          document.id,
          draft.preset === "receipt" ? "Receipts" : "Study",
        );
      await refresh();
      setResult(document.id);
      if (output.targetMet === false)
        Alert.alert(
          "Saved above target",
          "The smallest attempted output still exceeds your target. Review readability before sharing. Your draft is preserved.",
        );
      else
        Alert.alert("PDF saved", "Open it below, or keep editing this draft.");
    } finally {
      output.clean();
    }
  }
  function importFromGallery() {
    void task.run(async (signal, progress) => {
      beginSystemFlow();
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (!picked.canceled)
        for (let i = 0; i < picked.assets.length; i++) {
          if (signal.aborted) break;
          progress(`Saving image ${i + 1} of ${picked.assets.length}`);
          await addPage(id, picked.assets[i].uri);
        }
      reload();
    });
  }
  const count = pages.length;
  const pageWord = count === 1 ? "page" : "pages";
  const header = (
    <View style={{ gap: 12, marginBottom: 4 }}>
      <Header
        title={draft?.appendTo ? "Add pages" : name || "Scan"}
        subtitle={
          draft?.appendTo
            ? `${count} ${pageWord} to add to ${appendTarget?.name ?? "a document that is no longer available"}`
            : `${count} ${pageWord} · ${draft?.preset || "document"}`
        }
        action={
          <View style={{ flexDirection: "row" }}>
            {!draft?.appendTo && (
              <IconButton
                name={editingName ? "checkmark-outline" : "pencil-outline"}
                label={editingName ? "Done editing name" : "Rename and options"}
                onPress={() => setEditingName((value) => !value)}
              />
            )}
            <IconButton
              name="close-outline"
              label="Back"
              onPress={() => router.back()}
            />
          </View>
        }
      />
      {editingName && (
        <Card style={{ gap: 12 }}>
          <Field label="PDF name" value={name} onChangeText={setName} />
          <Field
            label="Size limit (MB, optional)"
            value={target}
            onChangeText={setTarget}
            numeric
          />
          <Label style={{ fontSize: 12, color: colors.secondary }}>
            A limit lowers resolution and quality to fit. The PDF is made of
            page images; check small text before sharing.
          </Label>
        </Card>
      )}
      <TaskStatus task={task} />
      {ads.available && count > 0 && (
        <RowCard
          icon={ads.watermarkFree ? "checkmark-circle-outline" : "sparkles-outline"}
          tone={ads.watermarkFree ? "green" : "orange"}
          title={ads.watermarkFree ? "No watermark" : "Remove the watermark"}
          detail={
            ads.watermarkFree
              ? `PDFs are clean for another ${describeTimeLeft(ads.rewards.watermarkFreeUntil)}.`
              : `New PDFs carry a small "${WATERMARK_TEXT}" mark. Watch a short video to remove it for 4 hours.`
          }
          disabled={ads.watermarkFree || !ads.canRequestAds || task.busy}
          onPress={() =>
            void ads.watchRewarded("watermark").then((outcome) => {
              if (outcome === "unavailable")
                Alert.alert("No video available", "Try again in a moment. PDFs still save normally.");
            })
          }
          trailing={ads.watermarkFree ? <View /> : undefined}
        />
      )}
      {count === 0 && (
        <Card style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
          <Icon name="scan-outline" size={32} />
          <Label style={{ fontWeight: "600" }}>No pages yet</Label>
          <Label style={{ fontSize: 13, color: colors.secondary }}>
            Use Camera or Gallery below to add pages.
          </Label>
        </Card>
      )}
      {count > 0 && (
        <Label style={{ fontSize: 12, color: colors.secondary, minHeight: 18 }}>
          {selected
            ? `Page ${selectedIndex + 1} selected · tap again to deselect`
            : "Tap a page to edit, move or remove it."}
        </Label>
      )}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll={false}>
        <FlatList
          data={pages}
          keyExtractor={(page) => page.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          extraData={selected}
          initialNumToRender={6}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          renderItem={({ item: page, index }) => {
            const isSelected = page.id === selected;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Page ${index + 1}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelected(isSelected ? null : page.id)}
                style={{ width: cellWidth, marginBottom: 16, alignItems: "center", gap: 6 }}
              >
                <View
                  style={{
                    width: cellWidth,
                    height: Math.round(cellWidth * 1.32),
                    borderRadius: 10,
                    overflow: "hidden",
                    backgroundColor: colors.surface,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? colors.blue : colors.border,
                  }}
                >
                  <Image
                    source={{ uri: pageUri(page) }}
                    resizeMode="contain"
                    style={{ width: "100%", height: "100%" }}
                  />
                  {isSelected && (
                    <View
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        backgroundColor: colors.blue,
                        borderRadius: 12,
                      }}
                    >
                      <Icon name="checkmark" size={18} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Label
                  style={{
                    fontSize: 13,
                    color: isSelected ? colors.blue : colors.secondary,
                    fontWeight: isSelected ? "600" : "400",
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </Label>
              </Pressable>
            );
          }}
          ListFooterComponent={
            result ? (
              <Button
                title="Open saved PDF"
                secondary
                icon="document-text-outline"
                onPress={() =>
                  router.push({ pathname: "/document/[id]", params: { id: result } })
                }
              />
            ) : null
          }
        />
        {selectedPage ? (
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
            <IconAction
              name="crop-outline"
              title="Edit"
              disabled={task.busy}
              onPress={() =>
                router.push({
                  pathname: "/page-editor",
                  params: { draftId: id, pageId: selectedPage.id },
                })
              }
            />
            <IconAction
              name="arrow-back-outline"
              title="Move left"
              disabled={task.busy || selectedIndex === 0}
              onPress={() =>
                task.run(async () => {
                  await reorderPages(pages, selectedIndex, -1);
                  reload();
                })
              }
            />
            <IconAction
              name="arrow-forward-outline"
              title="Move right"
              disabled={task.busy || selectedIndex === count - 1}
              onPress={() =>
                task.run(async () => {
                  await reorderPages(pages, selectedIndex, 1);
                  reload();
                })
              }
            />
            <IconAction
              name="trash-outline"
              title="Remove"
              destructive
              disabled={task.busy}
              onPress={() =>
                Alert.alert(
                  `Remove page ${selectedIndex + 1}?`,
                  "This cannot be undone. Saved documents are unchanged.",
                  [
                    { text: "Keep", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () =>
                        task.run(async () => {
                          await removePage(selectedPage);
                          setSelected(null);
                          reload();
                        }),
                    },
                  ],
                )
              }
            />
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
            <IconAction
              name="camera-outline"
              title="Camera"
              disabled={task.busy}
              onPress={() =>
                router.push({ pathname: "/scanner", params: { draftId: id } })
              }
            />
            <IconAction
              name="images-outline"
              title="Gallery"
              disabled={task.busy}
              onPress={importFromGallery}
            />
            <View style={{ flex: 2, minHeight: 64, justifyContent: "center" }}>
              <Button
                title={
                  draft?.appendTo
                    ? `Add ${count} ${pageWord}`
                    : "Create PDF"
                }
                icon={draft?.appendTo ? "add-outline" : "document-text-outline"}
                disabled={
                  !count ||
                  task.busy ||
                  (draft?.appendTo ? !appendTarget : !name.trim())
                }
                onPress={() => task.run(exportPdf)}
              />
            </View>
          </View>
        )}
      </Screen>
    </View>
  );
}
