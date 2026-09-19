import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  Card,
  Header,
  IconButton,
  Label,
  Screen,
} from "../../components/ui";
import { useTheme } from "../../theme/provider";
import { useDocuments } from "../documents/provider";
import type { LocalDocument } from "../../types/document";
import { engineRequirement, hasEngine } from "../../services/engine";

export function WorkspaceScreen({
  title,
  subtitle,
  children,
  native = false,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  native?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <Header
        title={title}
        subtitle={subtitle}
        action={
          <IconButton
            name="close-outline"
            label="Back"
            onPress={() => router.back()}
          />
        }
      />
      <View style={{ gap: 16, paddingBottom: insets.bottom }}>
        {native && !hasEngine ? (
          <Card>
            <Label>{engineRequirement}</Label>
            <Label style={{ marginTop: 12 }}>
              Build command: npm run android
            </Label>
          </Card>
        ) : (
          children
        )}
      </View>
    </Screen>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  numeric?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontWeight: "600", fontSize: 13 }}>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={{
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          backgroundColor: colors.surface,
          minHeight: multiline ? 180 : 48,
          padding: 12,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
export function useTask() {
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  async function run(
    work: (
      signal: AbortSignal,
      progress: (message: string) => void,
    ) => Promise<void>,
  ) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setProgress("Preparing…");
    try {
      await work(controller.signal, (message) => {
        if (mounted.current) setProgress(message);
      });
    } catch {
      if (mounted.current)
        Alert.alert(
          controller.signal.aborted ? "Cancelled" : "Could not complete",
          controller.signal.aborted
            ? "Your saved files and original documents are safe."
            : "Check the selected file, available storage, and entered values, then try again. Password-protected PDFs must be unlocked before importing.",
        );
    } finally {
      active.current = null;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  return {
    busy,
    progress,
    run,
    cancel: () => {
      active.current?.abort();
      setProgress("Cancelling after the current step…");
    },
  };
}
export function TaskStatus({ task }: { task: ReturnType<typeof useTask> }) {
  return task.busy ? (
    <Card style={{ gap: 12 }}>
      <Label accessibilityLiveRegion="polite">{task.progress}</Label>
      <Button title="Cancel" secondary onPress={task.cancel} />
    </Card>
  ) : null;
}
export function DocumentPicker({
  title,
  value,
  onSelect,
}: {
  title: string;
  value?: LocalDocument;
  onSelect: (document: LocalDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const { documents } = useDocuments();
  const { colors } = useTheme();
  return (
    <>
      <Button
        secondary
        title={value ? `${title}: ${value.name}` : title}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="slide"
      >
        <SafeAreaView
          style={{ flex: 1, padding: 20, backgroundColor: colors.background }}
        >
          <Header
            title="Choose a document"
            action={
              <IconButton
                name="close-outline"
                label="Close picker"
                onPress={() => setOpen(false)}
              />
            }
          />
          <FlatList
            data={documents.filter((d) => !d.trashedAt)}
            keyExtractor={(d) => d.id}
            ListEmptyComponent={<Label>Import or scan a document first.</Label>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <Card style={{ marginBottom: 10 }}>
                  <Label>{item.name}</Label>
                </Card>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
