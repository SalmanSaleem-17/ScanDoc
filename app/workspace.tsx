import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Button, IconButton, Label, RowCard, Section, type IconName } from "../src/components/ui";
import type { Tone } from "../src/theme/provider";
import {
  WorkspaceScreen,
  DocumentPicker,
  useTask,
  TaskStatus,
} from "../src/features/workflows/components";
import {
  addPage,
  createDraft,
  listDrafts,
  discardDraft,
  type Draft,
  type Preset,
} from "../src/services/workspace";
import { withDocumentPages } from "../src/features/workflows/processing";
import type { LocalDocument } from "../src/types/document";
import { hasEngine, engineRequirement } from "../src/services/engine";
export default function Workspace() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [document, setDocument] = useState<LocalDocument>();
  const task = useTask();
  const reload = useCallback(() => {
    void listDrafts()
      .then(setDrafts)
      .catch(() => Alert.alert("Could not open drafts", "Please try again."));
  }, []);
  useFocusEffect(reload);
  const presets: { id: Preset; title: string; detail: string; icon: IconName; tone: Tone }[] = [
    { id: "document", title: "Document", detail: "Capture pages, correct perspective, save a PDF.", icon: "document-text-outline", tone: "blue" },
    { id: "receipt", title: "Receipt", detail: "Enhancement, OCR naming and the Receipts folder.", icon: "receipt-outline", tone: "orange" },
    { id: "study", title: "Study notes", detail: "OCR and searchable text in your Study folder.", icon: "school-outline", tone: "green" },
    { id: "book", title: "Book pages", detail: "Split facing pages and adjust the spine curve.", icon: "book-outline", tone: "violet" },
  ];
  return (
    <WorkspaceScreen
      title="Scan workspace"
      subtitle="Your unfinished work stays here."
    >
      <TaskStatus task={task} />
      <Section title="Start a workflow" />
      {presets.map((preset) => (
        <RowCard
          key={preset.id}
          style={{ marginBottom: 10 }}
          icon={preset.icon}
          tone={preset.tone}
          title={preset.title}
          detail={preset.detail}
          disabled={task.busy}
          onPress={() =>
            task.run(async () => {
              const draft = await createDraft(preset.id);
              router.push({
                pathname: "/scanner",
                params: { draftId: draft.id },
              });
            })
          }
        />
      ))}
      <Section title="Continue a draft" />
      {!drafts.length && <Label>No unfinished scans yet.</Label>}
      {drafts.map((draft) => (
        <RowCard
          key={draft.id}
          style={{ marginBottom: 10 }}
          icon="layers-outline"
          tone="cyan"
          title={draft.name}
          detail={`${draft.preset} · tap to continue`}
          disabled={task.busy}
          onPress={() =>
            router.push({ pathname: "/draft/[id]", params: { id: draft.id } })
          }
          trailing={
          <IconButton
            plain
            name="trash-outline"
            label={`Discard ${draft.name}`}
            onPress={() =>
              Alert.alert(
                "Discard unfinished scan?",
                "Its draft pages will be permanently removed. Saved documents are unchanged.",
                [
                  { text: "Keep", style: "cancel" },
                  {
                    text: "Discard",
                    style: "destructive",
                    onPress: () =>
                      task.run(async () => {
                        await discardDraft(draft.id);
                        reload();
                      }),
                  },
                ],
              )
            }
          />
          }
        />
      ))}
      <Section title="Edit an existing file" />
      <DocumentPicker
        title="Choose document"
        value={document}
        onSelect={setDocument}
      />
      <Button
        title="Create editable copy"
        disabled={!document || task.busy}
        onPress={() => {
          if (!document) return;
          if (document.kind === "pdf" && !hasEngine) {
            Alert.alert("Development build required", engineRequirement);
            return;
          }
          void task.run(async (signal, progress) => {
            const draft = await createDraft();
            await withDocumentPages(
              document,
              signal,
              progress,
              async (uris) => {
                for (const uri of uris) {
                  if (signal.aborted) break;
                  await addPage(draft.id, uri);
                }
              },
            );
            reload();
            router.push({ pathname: "/draft/[id]", params: { id: draft.id } });
          });
        }}
      />
    </WorkspaceScreen>
  );
}
