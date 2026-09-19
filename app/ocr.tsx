import { useState } from "react";
import { Alert, Share } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import { Button, Card, Label } from "../src/components/ui";
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
import { recognizeDocument } from "../src/features/workflows/processing";
import { suggestName } from "../src/features/workflows/logic.mjs";
import { useDocuments } from "../src/features/documents/provider";
export default function Ocr() {
  const [document, setDocument] = useState<LocalDocument>();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [confidence, setConfidence] = useState<number>();
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
          setDocument(d);
          setConfidence(undefined);
          setName(d.name);
          setText("");
          void getText(d.id)
            .then(setText)
            .catch(() => {});
        }}
      />
      <TaskStatus task={task} />
      <Button
        title="Recognize all pages"
        disabled={!document || task.busy}
        onPress={() =>
          task.run(async (signal, progress) => {
            const result = await recognizeDocument(document!, signal, progress);
            setText(result.text);
            setConfidence(result.confidence);
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
        <Card>
          <Label>
            OCR confidence: {Math.round(confidence)}%.{" "}
            {confidence < 60
              ? "Text may be difficult to read. Check lighting, focus, and recognition mistakes."
              : "Review names, dates, and numbers carefully."}
          </Label>
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
            await Sharing.shareAsync(file.uri, { mimeType: "text/plain" });
          })
        }
      />
    </WorkspaceScreen>
  );
}
