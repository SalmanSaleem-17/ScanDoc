import { useRef, useState } from "react";
import { Alert, Share } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import {
  Button,
  Card,
  Label,
  SegmentedControl,
  Toggle,
} from "../src/components/ui";
import {
  DocumentPicker,
  WorkspaceScreen,
  Field,
  TaskStatus,
  useTask,
} from "../src/features/workflows/components";
import type { LocalDocument } from "../src/types/document";
import { getText, saveText, putFolder } from "../src/services/workspace";
import { renameDocument } from "../src/services/storage";
import {
  recognizeDocument,
  type OcrLayout,
} from "../src/features/workflows/processing";
import { suggestName } from "../src/features/workflows/logic.mjs";
import { useDocuments } from "../src/features/documents/provider";
import { beginSystemFlow } from "../src/features/ads/systemFlow";
export default function Ocr() {
  const selection = useRef("");
  const [document, setDocument] = useState<LocalDocument>();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [confidence, setConfidence] = useState<number>();
  const [rotated, setRotated] = useState(0);
  const [layout, setLayout] = useState<OcrLayout>("auto");
  const [preprocess, setPreprocess] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [folder, setFolder] = useState("");
  const task = useTask();
  const { refresh } = useDocuments();
  return (
    <WorkspaceScreen
      title="Text & smart naming"
      subtitle="Offline English OCR · Review recognition before saving."
      native
    >
      <DocumentPicker
        title="Choose document"
        value={document}
        onSelect={(d) => {
          if (task.busy) return;
          selection.current=d.id;
          setDocument(d);
          setConfidence(undefined);
          setRotated(0);
          setName(d.name);
          setText("");
          void getText(d.id)
            .then(value => { if(selection.current===d.id) setText(value); })
            .catch(() => {});
        }}
      />
      <SegmentedControl<OcrLayout>
        label="Page layout"
        value={layout}
        options={[
          { value: "auto", title: "Automatic" },
          { value: "block", title: "One block" },
          { value: "sparse", title: "Scattered text" },
        ]}
        onChange={(value) => !task.busy && setLayout(value)}
      />
      <Toggle
        label="Clean up the page first"
        detail="Flattens shadows and uneven lighting, then straightens small skew. Recommended for photos."
        value={preprocess}
        disabled={task.busy}
        onChange={setPreprocess}
      />
      <Toggle
        label="Detect sideways or upside-down pages"
        detail="Only runs when a page reads poorly, so it rarely costs extra time."
        value={autoRotate}
        disabled={task.busy}
        onChange={setAutoRotate}
      />
      <TaskStatus task={task} />
      <Button
        title="Recognize all pages"
        disabled={!document || task.busy}
        onPress={() =>
          task.run(async (signal, progress) => {
            const result = await recognizeDocument(document!, signal, progress, {
              layout,
              preprocess,
              deskew: preprocess,
              autoRotate,
            });
            setText(result.text);
            setConfidence(result.confidence);
            setRotated(result.rotated);
            setName(
              suggestName(
                result.text,
                document!.kind === "pdf"
                  ? "pdf"
                  : document!.path.split(".").pop(),
              ),
            );
            if (!result.text.trim())
              Alert.alert(
                "No readable text",
                "Try a sharper, evenly lit image. English recognition is supported in this build.",
              );
          })
        }
      />
      {confidence !== undefined && (
        <Card style={{ gap: 8 }}>
          <Label style={{ fontWeight: "600" }}>
            {`Recognition score ${Math.round(confidence)} of 100.`}
          </Label>
          <Label style={{ fontSize: 12 }}>
            This is the engine's average certainty about the characters it
            chose. It is not a measure of whether the text is correct: a
            confident engine can still be wrong. Always check names, dates and
            amounts against the page.
          </Label>
          {confidence < 60 && (
            <Label style={{ fontSize: 12 }}>
              A low score usually means poor lighting, focus or a page that is
              not flat. Rescanning often helps more than editing.
            </Label>
          )}
          {rotated > 0 && (
            <Label style={{ fontSize: 12 }}>
              {`${rotated} ${rotated === 1 ? "page was" : "pages were"} rotated automatically before reading.`}
            </Label>
          )}
        </Card>
      )}
      <Field
        label="Recognized text (editable)"
        value={text}
        onChangeText={setText}
        multiline
      />
      <Button
        title="Save text to local search"
        disabled={!document || task.busy}
        onPress={() =>
          task.run(async () => {
            await saveText(document!.id, text);
            Alert.alert(
              "Text saved",
              "Search for words from this document in Documents.",
            );
          })
        }
      />
      <Field
        label="Suggested document name"
        value={name}
        onChangeText={setName}
      />
      <Button
        title="Suggest a name from text"
        secondary
        disabled={!text.trim() || task.busy}
        onPress={() =>
          setName(
            suggestName(
              text,
              document?.kind === "pdf"
                ? "pdf"
                : document?.path.split(".").pop(),
            ),
          )
        }
      />
      <Button
        title="Apply name"
        secondary
        disabled={!document || !name.trim() || task.busy}
        onPress={() =>
          task.run(async () => {
            await renameDocument(document!.id, name);
            await refresh();
            Alert.alert(
              "Name updated",
              "Your file has been renamed in the library.",
            );
          })
        }
      />
      <Field
        label="Folder (for example Receipts or Study)"
        value={folder}
        onChangeText={setFolder}
      />
      <Button
        title="Save folder"
        secondary
        disabled={!document || !folder.trim() || task.busy}
        onPress={() =>
          task.run(async () => {
            await putFolder(document!.id, folder.trim().slice(0, 60));
            Alert.alert(
              "Folder saved",
              "Find the folder using document search.",
            );
          })
        }
      />
      <Button
        title="Share text"
        secondary
        disabled={!text.trim() || task.busy}
        onPress={() =>
          task.run(async () => {
            await Share.share({ message: text });
          })
        }
      />
      <Button
        title="Export TXT"
        secondary
        disabled={!text.trim() || task.busy}
        onPress={() =>
          task.run(async () => {
            const dir = new Directory(Paths.document, "ScanDoc", "Exports");
            dir.create({ idempotent: true, intermediates: true });
            const file = new File(dir, `Text_${Crypto.randomUUID()}.txt`);
            file.write(text);
            beginSystemFlow();
            await Sharing.shareAsync(file.uri, { mimeType: "text/plain" });
          })
        }
      />
    </WorkspaceScreen>
  );
}
