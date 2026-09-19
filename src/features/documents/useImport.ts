import { useRef, useState } from "react";
import { Alert } from "react-native";
import { pickDocuments } from "./actions";
import { useDocuments } from "./provider";
export function useImport() {
  const { refresh } = useDocuments();
  const lock = useRef(false);
  const [progress, setProgress] = useState("");
  async function importDocuments() {
    if (lock.current) return;
    lock.current = true;
    try {
      const result = await pickDocuments(setProgress);
      await refresh();
      if (result.failed)
        Alert.alert(
          "Import completed",
          `${result.imported} imported. ${result.failed} could not be read or saved. Check file format and available storage.`,
        );
    } catch {
      Alert.alert(
        "Could not import",
        "Choose a supported file and check available storage, then try again.",
      );
    } finally {
      lock.current = false;
      setProgress("");
    }
  }
  return { importDocuments, progress };
}
