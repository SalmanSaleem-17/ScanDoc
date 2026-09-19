import { useCallback, useState } from "react";
import { Alert, Image, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, Label } from "../../src/components/ui";
import {
  WorkspaceScreen,
  Field,
  TaskStatus,
  useTask,
} from "../../src/features/workflows/components";
import {
  addPage,
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
export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [result, setResult] = useState("");
  const { refresh } = useDocuments();
  const task = useTask();
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
      if (draft.preset === "receipt" && text.trim()) title = suggestName(text);
    }
    const output = await runEngine(
      "pdf",
      { uris, targetBytes: target ? Math.floor(mb * 1024 * 1024) : 0 },
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
        Alert.alert(
          "PDF saved",
          "Your draft is preserved for further editing.",
        );
    } finally {
      output.clean();
    }
  }
  return (
    <WorkspaceScreen
      title="Arrange your pages"
      subtitle={`${pages.length} pages · ${draft?.preset || "document"} workflow`}
    >
      <TaskStatus task={task} />
      <View style={{ gap: 10 }}>
        <Button
          title="Add camera page"
          disabled={task.busy}
          onPress={() =>
            router.push({ pathname: "/scanner", params: { draftId: id } })
          }
        />
        <Button
          secondary
          title="Add gallery images"
          disabled={task.busy}
          onPress={() =>
            task.run(async (signal, progress) => {
              const selected = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsMultipleSelection: true,
                quality: 1,
              });
              if (!selected.canceled)
                for (let i = 0; i < selected.assets.length; i++) {
                  if (signal.aborted) break;
                  progress(
                    `Saving image ${i + 1} of ${selected.assets.length}`,
                  );
                  await addPage(id, selected.assets[i].uri);
                }
              reload();
            })
          }
        />
      </View>
      {pages.map((page, index) => (
        <Card key={page.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Image
              source={{ uri: pageUri(page) }}
              style={{ width: 64, height: 82 }}
              resizeMode="contain"
            />
            <Label>Page {index + 1}</Label>
          </View>
          <Button
            title={
              draft?.preset === "book"
                ? "Crop, redact or split book"
                : "Crop, enhance or redact"
            }
            secondary
            disabled={task.busy}
            onPress={() =>
              router.push({
                pathname: "/page-editor",
                params: { draftId: id, pageId: page.id },
              })
            }
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="↑"
                secondary
                disabled={task.busy || index === 0}
                onPress={() =>
                  task.run(async () => {
                    await reorderPages(pages, index, -1);
                    reload();
                  })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="↓"
                secondary
                disabled={task.busy || index === pages.length - 1}
                onPress={() =>
                  task.run(async () => {
                    await reorderPages(pages, index, 1);
                    reload();
                  })
                }
              />
            </View>
          </View>
          <Button
            title="Remove page"
            secondary
            disabled={task.busy}
            onPress={() =>
              Alert.alert(
                "Remove this draft page?",
                "This cannot be undone. Saved documents are unchanged.",
                [
                  { text: "Keep", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () =>
                      task.run(async () => {
                        await removePage(page);
                        reload();
                      }),
                  },
                ],
              )
            }
          />
        </Card>
      ))}
      <Field label="PDF name" value={name} onChangeText={setName} />
      <Field
        label="Optional size target (MB)"
        value={target}
        onChangeText={setTarget}
        numeric
      />
      <Label>
        Smaller targets reduce resolution and quality. Export creates an
        image-only PDF; review small text before sharing.
      </Label>
      <Button
        title="Create PDF"
        disabled={!pages.length || task.busy || !name.trim()}
        onPress={() => task.run(exportPdf)}
      />
      {result && (
        <Button
          title="Open saved PDF"
          secondary
          onPress={() =>
            router.push({ pathname: "/document/[id]", params: { id: result } })
          }
        />
      )}
    </WorkspaceScreen>
  );
}
