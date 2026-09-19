import { useState } from "react";
import { router } from "expo-router";
import { Button, Card, Label } from "../src/components/ui";
import {
  WorkspaceScreen,
  DocumentPicker,
  Field,
  TaskStatus,
  useTask,
} from "../src/features/workflows/components";
import type { LocalDocument } from "../src/types/document";
import { withDocumentPages } from "../src/features/workflows/processing";
import { runEngine } from "../src/services/engine";
import { storePdf } from "../src/services/workspace";
import { formatBytes } from "../src/utils/files.mjs";
import { useDocuments } from "../src/features/documents/provider";
export default function ExportSize() {
  const [document, setDocument] = useState<LocalDocument>();
  const [target, setTarget] = useState("2");
  const [result, setResult] = useState<{
    id: string;
    size: number;
    met: boolean;
  }>();
  const task = useTask();
  const { refresh } = useDocuments();
  return (
    <WorkspaceScreen
      title="Export size target"
      subtitle="Prepare a PDF for upload limits."
      native
    >
      <DocumentPicker
        title="Choose document"
        value={document}
        onSelect={(d) => {
          if (!task.busy) {
            setDocument(d);
            setResult(undefined);
          }
        }}
      />
      <Field
        label="Maximum file size (MB)"
        value={target}
        onChangeText={setTarget}
        numeric
      />
      <Label>
        This makes a new image-only PDF. Selectable text, links, forms,
        signatures, and accessibility tags are not preserved. Originals stay
        untouched.
      </Label>
      <TaskStatus task={task} />
      <Button
        title="Create smaller PDF"
        disabled={
          !document ||
          task.busy ||
          !Number.isFinite(Number(target)) ||
          Number(target) < 0.1 ||
          Number(target) > 500
        }
        onPress={() =>
          task.run(async (signal, progress) => {
            await withDocumentPages(
              document!,
              signal,
              progress,
              async (uris) => {
                const output = await runEngine(
                  "pdf",
                  {
                    uris,
                    targetBytes: Math.floor(Number(target) * 1024 * 1024),
                  },
                  { signal, progress },
                );
                try {
                  const saved = await storePdf(
                    output.uri!,
                    `Export_${Date.now()}.pdf`,
                    uris.length,
                  );
                  await refresh();
                  setResult({
                    id: saved.id,
                    size: saved.size,
                    met: !!output.targetMet,
                  });
                } finally {
                  output.clean();
                }
              },
            );
          })
        }
      />
      {result && (
        <Card style={{ gap: 12 }}>
          <Label>
            {result.met ? "Target achieved" : "Target not reached"} ·{" "}
            {formatBytes(result.size)}
          </Label>
          <Label>
            Review small text before sharing. Compression cannot guarantee every
            target without losing readability.
          </Label>
          <Button
            title="Open / share result"
            onPress={() =>
              router.push({
                pathname: "/document/[id]",
                params: { id: result.id },
              })
            }
          />
        </Card>
      )}
    </WorkspaceScreen>
  );
}
