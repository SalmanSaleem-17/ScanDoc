import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { importFile, documentUri } from "../../services/storage";
import type { LocalDocument } from "../../types/document";
export async function pickDocuments(onProgress: (message: string) => void) {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { imported: 0, failed: 0 };
  let imported = 0;
  let failed = 0;
  for (let index = 0; index < result.assets.length; index++) {
    const asset = result.assets[index];
    onProgress(`Importing ${index + 1} of ${result.assets.length}`);
    try {
      await importFile(asset.uri, asset.name);
      imported++;
    } catch {
      failed++;
    } finally {
      try {
        const cached = new File(asset.uri);
        if (cached.exists && asset.uri.includes("/cache/")) cached.delete();
      } catch {}
    }
  }
  return { imported, failed };
}
export async function shareDocument(document: LocalDocument) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is unavailable on this device.");
  await Sharing.shareAsync(documentUri(document), {
    mimeType:
      document.kind === "pdf"
        ? "application/pdf"
        : document.path.endsWith(".png")
          ? "image/png"
          : document.path.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg",
    dialogTitle: document.name,
  });
}
