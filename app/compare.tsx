import { useEffect, useRef, useState } from "react";
import { Image } from "react-native";
import { Button, Card, Label } from "../src/components/ui";
import {
  WorkspaceScreen,
  DocumentPicker,
  TaskStatus,
  useTask,
} from "../src/features/workflows/components";
import type { LocalDocument } from "../src/types/document";
import { getText } from "../src/services/workspace";
import {
  recognizeDocument,
  withDocumentPages,
} from "../src/features/workflows/processing";
import { changedLines } from "../src/features/workflows/logic.mjs";
import { runEngine } from "../src/services/engine";
import { importFile } from "../src/services/storage";
import { shareDocument } from "../src/features/documents/actions";
import { useDocuments } from "../src/features/documents/provider";
export default function Compare() {
  const [first, setFirst] = useState<LocalDocument>();
  const [second, setSecond] = useState<LocalDocument>();
  const [diff, setDiff] = useState<{ added: string[]; removed: string[] }>();
  const [image, setImage] = useState("");
  const [percent, setPercent] = useState(0);
  const cleanup = useRef<(() => void) | null>(null);
  const task = useTask();
  const { refresh } = useDocuments();
  useEffect(() => () => cleanup.current?.(), []);
  return (
    <WorkspaceScreen
      title="Compare documents"
      subtitle="Check changed text and first-page appearance."
      native
    >
      <DocumentPicker
        title="Original"
        value={first}
        onSelect={(d) => {
          if (!task.busy) {
            setFirst(d);
            setDiff(undefined);
            setImage("");
          }
        }}
      />
      <DocumentPicker
        title="Updated"
        value={second}
        onSelect={(d) => {
          if (!task.busy) {
            setSecond(d);
            setDiff(undefined);
            setImage("");
          }
        }}
      />
      <TaskStatus task={task} />
      <Button
        title="Compare"
        disabled={!first || !second || first.id === second.id || task.busy}
        onPress={() =>
          task.run(async (signal, progress) => {
            let a = await getText(first!.id);
            let b = await getText(second!.id);
            if (!a)
              a = (await recognizeDocument(first!, signal, progress)).text;
            if (!b)
              b = (await recognizeDocument(second!, signal, progress)).text;
            setDiff(changedLines(a, b));
            await withDocumentPages(first!, signal, progress, async (left) =>
              withDocumentPages(second!, signal, progress, async (right) => {
                const result = await runEngine(
                  "compare",
                  { first: left[0], second: right[0] },
                  { signal },
                );
                cleanup.current?.();
                cleanup.current = result.clean;
                setImage(result.uri!);
                setPercent(result.changedPercent!);
              }),
            );
          })
        }
      />
      {diff && (
        <>
          <Card style={{ gap: 12 }}>
            <Label>Removed lines ({diff.removed.length})</Label>
            <Label selectable>{diff.removed.join("\n") || "None"}</Label>
            <Label>Added lines ({diff.added.length})</Label>
            <Label selectable>{diff.added.join("\n") || "None"}</Label>
          </Card>
          <Label>
            Text comparison ignores line ordering. OCR errors can appear as
            differences; verify against the originals.
          </Label>
        </>
      )}
      {!!image && (
        <>
          <Image
            source={{ uri: image }}
            resizeMode="contain"
            style={{ width: "100%", height: 380 }}
          />
          <Label>
            First page only: {percent.toFixed(1)}% of normalized pixels differ.
            Red marks show changes. Camera angle, lighting, and alignment also
            affect this result.
          </Label>
          <Button
            title="Save & share comparison image"
            disabled={task.busy}
            onPress={() =>
              task.run(async () => {
                const result = await importFile(
                  image,
                  `Comparison_${Date.now()}.jpg`,
                );
                await refresh();
                await shareDocument(result);
              })
            }
          />
        </>
      )}
    </WorkspaceScreen>
  );
}
