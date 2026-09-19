import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Button, Card, Label, Section } from "../src/components/ui";
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
  const presets: { id: Preset; title: string; detail: string }[] = [
    {
      id: "document",
      title: "Document",
      detail: "Capture pages, correct perspective, save a PDF.",
    },
    {
      id: "receipt",
      title: "Save receipt",
      detail: "Enhancement, OCR naming and the Receipts folder.",
    },
    {
      id: "study",
      title: "Study notes",
      detail: "OCR and searchable text in your Study folder.",
    },
    {
      id: "book",
      title: "Book pages",
      detail: "Split facing pages and adjust the spine curve.",
    },
  ];
  return (
    <WorkspaceScreen
      title="Scan workspace"
      subtitle="Your unfinished work stays here."
    >
      <TaskStatus task={task} />
      <Section title="Start a workflow" />
      {presets.map((preset) => (
        <Card key={preset.id} style={{ gap: 10 }}>
          <Label>{preset.detail}</Label>
          <Button
            title={preset.title}
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
        </Card>
      ))}
      <Section title="Continue a draft" />
      {!drafts.length && <Label>No unfinished scans yet.</Label>}
      {drafts.map((draft) => (
        <Card key={draft.id} style={{ gap: 10 }}>
          <Label>
            {draft.name} · {draft.preset}
          </Label>
          <Button
            secondary
            title="Resume pages"
            disabled={task.busy}
            onPress={() =>
              router.push({ pathname: "/draft/[id]", params: { id: draft.id } })
            }
          />
          <Button
            secondary
            title="Discard draft"
            disabled={task.busy}
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
        </Card>
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
