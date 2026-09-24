import { useState } from "react";
import { Alert, Image, TextInput, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  IconButton,
  Label,
  Screen,
} from "../../src/components/ui";
import { useDocuments } from "../../src/features/documents/provider";
import {
  deleteDocumentForever,
  documentUri,
  renameDocument,
  trashDocument,
} from "../../src/services/storage";
import { shareDocument } from "../../src/features/documents/actions";
import { useTheme } from "../../src/theme/provider";
import { formatBytes } from "../../src/utils/files.mjs";
import { daysUntilPurge } from "../../src/services/library.mjs";
export default function Document() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, refresh } = useDocuments();
  const document = documents.find((d) => d.id === id);
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch {
      Alert.alert(
        "Could not complete this action",
        "Check the file and available storage, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!document)
    return (
      <Screen>
        <EmptyState
          title="Document unavailable"
          action={<Button title="Go back" onPress={() => router.back()} />}
        />
      </Screen>
    );
  return (
    <Screen>
      <Header
        title="Document"
        action={
          <IconButton
            name="close-outline"
            label="Close document"
            onPress={() => router.back()}
          />
        }
      />
      <View style={{ gap: 16 }}>
        {document.kind === "image" ? (
          <Image
            source={{ uri: documentUri(document) }}
            resizeMode="contain"
            style={{
              width: "100%",
              height: 330,
              backgroundColor: "#E4E7EC",
              borderRadius: 12,
            }}
          />
        ) : (
          <Card
            style={{
              minHeight: 220,
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <Icon name="document-text-outline" size={64} />
            <Label>PDF document</Label>
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              Use Share to open in a PDF reader.
            </Label>
          </Card>
        )}
        <Label style={{ fontSize: 20, fontWeight: "600" }}>
          {document.name}
        </Label>
        <Label style={{ color: colors.secondary }}>
          {document.kind.toUpperCase()} · {formatBytes(document.size)}
        </Label>
        {editing && (
          <Card style={{ gap: 12 }}>
            <TextInput
              accessibilityLabel="Document name"
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={100}
              style={{
                color: colors.text,
                borderBottomWidth: 1,
                borderColor: colors.border,
                minHeight: 48,
              }}
            />
            <Button
              title="Save name"
              disabled={busy || !name.trim()}
              onPress={() =>
                perform(async () => {
                  await renameDocument(document.id, name);
                  setEditing(false);
                })
              }
            />
            <Button
              title="Cancel"
              secondary
              onPress={() => setEditing(false)}
            />
          </Card>
        )}
        <Button
          title="Document tools"
          icon="apps-outline"
          secondary
          onPress={() => router.push("/tools")}
        />
        <Button
          title="Share / export"
          icon="share-outline"
          disabled={busy}
          onPress={() => perform(() => shareDocument(document))}
        />
        <Button
          title="Rename"
          icon="pencil-outline"
          secondary
          disabled={busy}
          onPress={() => {
            setName(document.name);
            setEditing(true);
          }}
        />
        {document.trashedAt ? (
          <Card style={{ gap: 12 }}>
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              {(() => {
                const days = daysUntilPurge(document.trashedAt);
                return `In Trash · removed automatically in ${days} ${days === 1 ? "day" : "days"}.`;
              })()}
            </Label>
            <Button
              title="Restore document"
              icon="refresh-outline"
              secondary
              disabled={busy}
              onPress={() => perform(() => trashDocument(document.id, true))}
            />
            <Button
              title="Delete forever"
              icon="trash-outline"
              destructive
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Delete forever?",
                  "This removes the file and its recognized text from this device. It cannot be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete forever",
                      style: "destructive",
                      onPress: () =>
                        perform(async () => {
                          await deleteDocumentForever(document.id);
                          router.back();
                        }),
                    },
                  ],
                )
              }
            />
          </Card>
        ) : (
          <Button
            title="Move to Trash"
            icon="trash-outline"
            secondary
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Move to Trash?",
                "You can restore this document from the Trash filter in Documents.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Move to Trash",
                    style: "destructive",
                    onPress: () =>
                      perform(async () => {
                        await trashDocument(document.id);
                        router.back();
                      }),
                  },
                ],
              )
            }
          />
        )}
      </View>
    </Screen>
  );
}
