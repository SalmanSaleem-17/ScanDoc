import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
import { importFile, documentUri } from "../../services/storage";
import { exportFileName } from "../../services/library.mjs";
import type { LocalDocument } from "../../types/document";
import { beginSystemFlow } from "../ads/systemFlow";
export async function pickDocuments(onProgress: (message: string) => void) {
  beginSystemFlow();
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
// Library files are stored under their id, and the share sheet shows the file
// name, so a copy carrying the document's own name is shared instead of the
// stored file. The copy lives in the cache and is replaced on the next share.
async function namedCopyForSharing(document: LocalDocument) {
  const extension = document.path.split(".").pop() || (document.kind === "pdf" ? "pdf" : "jpg");
  const folder = new Directory(Paths.cache, "Share");
  try {
    if (folder.exists) folder.delete();
  } catch {}
  folder.create({ idempotent: true, intermediates: true });
  const copy = new File(folder, `${exportFileName(document.name, document.kind)}.${extension}`);
  await new File(documentUri(document)).copy(copy);
  return copy.uri;
}
export async function shareDocument(document: LocalDocument) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is unavailable on this device.");
  let uri = documentUri(document);
  try {
    uri = await namedCopyForSharing(document);
  } catch {
    // Out of cache space: the stored file still shares, just under its id.
  }
  beginSystemFlow();
  await Sharing.shareAsync(uri, {
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
