import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EncodingType,
  StorageAccessFramework,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import { documentUri } from "./storage";
import { exportFileName } from "./library.mjs";
import { beginSystemFlow } from "../features/ads/systemFlow";
import type { LocalDocument } from "../types/document";

// "Save to device" writes a copy of a document into a folder the person picks
// through Android's own folder chooser (Storage Access Framework), typically
// Downloads or a cloud-synced folder. The choice is remembered so later saves
// are one tap, and it can be changed in Settings. No storage permission is
// needed on any Android version: the grant is for the chosen folder only.
export const EXPORT_DIR_KEY = "export.directory";

export type SaveOutcome =
  | { status: "saved"; uri: string; name: string }
  | { status: "cancelled" };

export function mimeOf(document: LocalDocument) {
  if (document.kind === "pdf") return "application/pdf";
  if (document.path.endsWith(".png")) return "image/png";
  if (document.path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function exportDirectory() {
  return AsyncStorage.getItem(EXPORT_DIR_KEY).catch(() => null);
}

/**
 * Opens the system folder picker; null when the person backs out. The picker
 * starts in Download, though Android 11+ refuses the top-level Download and
 * Documents folders themselves ("Can't use this folder"), so people create or
 * pick a sub-folder such as Download/ScanDoc; the UI says so up front.
 */
export const FOLDER_HINT =
  "Android does not allow the whole Download folder: create or choose a folder inside it, such as Download/ScanDoc, then tap Use this folder.";
export async function chooseExportDirectory(): Promise<string | null> {
  let initial: string | null = null;
  try {
    initial = StorageAccessFramework.getUriForDirectoryInRoot("Download");
  } catch {}
  beginSystemFlow();
  const permission =
    await StorageAccessFramework.requestDirectoryPermissionsAsync(initial);
  if (!permission.granted) return null;
  await AsyncStorage.setItem(EXPORT_DIR_KEY, permission.directoryUri).catch(
    () => {},
  );
  return permission.directoryUri;
}

async function writeCopy(document: LocalDocument, directory: string) {
  const name = exportFileName(document.name, document.kind);
  const target = await StorageAccessFramework.createFileAsync(
    directory,
    name,
    mimeOf(document),
  );
  const data = await readAsStringAsync(documentUri(document), {
    encoding: EncodingType.Base64,
  });
  await writeAsStringAsync(target, data, { encoding: EncodingType.Base64 });
  return { status: "saved" as const, uri: target, name };
}

export async function saveToDevice(document: LocalDocument): Promise<SaveOutcome> {
  let directory = await exportDirectory();
  let chosenNow = false;
  if (!directory) {
    directory = await chooseExportDirectory();
    chosenNow = true;
    if (!directory) return { status: "cancelled" };
  }
  try {
    return await writeCopy(document, directory);
  } catch (error) {
    // A remembered folder can be deleted, or its grant revoked, since it was
    // chosen. Forget it and ask once more; a fresh choice that still fails is
    // a real error.
    if (chosenNow) throw error;
    await AsyncStorage.removeItem(EXPORT_DIR_KEY).catch(() => {});
    const next = await chooseExportDirectory();
    if (!next) return { status: "cancelled" };
    return writeCopy(document, next);
  }
}

// Images belong in the gallery, where every other app looks for them; PDFs
// belong in a folder the person can browse with Files. saveDocument routes
// each kind to the right place so screens only need one "Save" action.
export type SaveDestination = "gallery" | "folder";

export async function saveImageToGallery(document: LocalDocument): Promise<SaveOutcome> {
  const MediaLibrary = await import("expo-media-library");
  beginSystemFlow();
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return { status: "cancelled" };
  await MediaLibrary.saveToLibraryAsync(documentUri(document));
  return { status: "saved", uri: documentUri(document), name: exportFileName(document.name, document.kind) };
}

/** Where a document goes when saved: images to the gallery, PDFs to the folder. */
export function saveDestination(document: LocalDocument): SaveDestination {
  return document.kind === "image" ? "gallery" : "folder";
}

export function saveDocument(document: LocalDocument): Promise<SaveOutcome> {
  return saveDestination(document) === "gallery" ? saveImageToGallery(document) : saveToDevice(document);
}
