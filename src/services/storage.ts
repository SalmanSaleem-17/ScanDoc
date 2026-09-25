import { File, FileMode, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { LocalDocument } from "../types/document";
import { cleanName, fileKind, matchesHeader } from "../utils/files.mjs";
import { expiredTrash } from "./library.mjs";
import { openDatabase, root, thumbsDir } from "./database";

export async function listDocuments() {
  return (await openDatabase()).getAllAsync<LocalDocument>(
    "SELECT * FROM documents ORDER BY updatedAt DESC",
  );
}
export function documentUri(document: LocalDocument) {
  return new File(root, document.path).uri;
}
export async function importFile(
  uri: string,
  name: string,
  source: LocalDocument["source"] = "import",
) {
  const connection = await openDatabase();
  const kind = fileKind(name);
  const input = new File(uri);
  if (!input.exists || !input.size)
    throw new Error(
      "This file is empty or cannot be read. Choose another file.",
    );
  const handle = input.open(FileMode.ReadOnly);
  try {
    if (!matchesHeader(name, handle.readBytes(Math.min(12, input.size))))
      throw new Error("The file contents do not match a supported format.");
  } finally {
    handle.close();
  }
  if (Paths.availableDiskSpace < input.size + 10 * 1024 * 1024)
    throw new Error("Not enough storage. Free some space and try again.");
  const id = Crypto.randomUUID();
  const extension = name.toLowerCase().split(".").pop();
  const folder =
    source === "camera"
      ? "Scans"
      : source === "compressed"
        ? "Compressed"
        : kind === "pdf"
          ? "PDF"
          : "Images";
  const path = `${folder}/${id}.${extension}`;
  const output = new File(root, path);
  try {
    // Asynchronous natively; the row below must not exist before the file.
    await input.copy(output);
    const now = Date.now();
    const document: LocalDocument = {
      id,
      name: cleanName(name),
      kind,
      path,
      size: output.size,
      createdAt: now,
      updatedAt: now,
      pageCount: kind === "image" ? 1 : null,
      source,
      trashedAt: null,
    };
    await connection.runAsync(
      "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      document.name,
      kind,
      path,
      document.size,
      now,
      now,
      document.pageCount,
      source,
      null,
    );
    return document;
  } catch (error) {
    if (output.exists) output.delete();
    throw error;
  }
}
export async function renameDocument(id: string, name: string) {
  await (
    await openDatabase()
  ).runAsync(
    "UPDATE documents SET name = ?, updatedAt = ? WHERE id = ?",
    cleanName(name),
    Date.now(),
    id,
  );
}
export async function trashDocument(id: string, restore = false) {
  await (
    await openDatabase()
  ).runAsync(
    "UPDATE documents SET trashedAt = ?, updatedAt = ? WHERE id = ?",
    restore ? null : Date.now(),
    Date.now(),
    id,
  );
}
/**
 * Removes a document and every row that referred to it in one transaction:
 * recognised text, its search index entry, its folder and any receipt. The
 * tables have no foreign keys, so nothing else would clean these up, and a
 * search hit pointing at a deleted file is worse than no hit. The file itself
 * is removed after the commit; if that fails the row is already gone, so the
 * worst case is an orphaned file rather than a listed document with no file.
 */
export async function deleteDocumentForever(id: string) {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ path: string }>(
    "SELECT path FROM documents WHERE id = ?",
    id,
  );
  if (!row) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM document_search WHERE documentId = ?", id);
    await tx.runAsync("DELETE FROM document_text WHERE documentId = ?", id);
    await tx.runAsync("DELETE FROM document_folders WHERE documentId = ?", id);
    await tx.runAsync("DELETE FROM receipts WHERE documentId = ?", id);
    await tx.runAsync("DELETE FROM documents WHERE id = ?", id);
  });
  try {
    const file = new File(root, row.path);
    if (file.exists) file.delete();
  } catch {}
  deletePreviewFiles(id);
  return true;
}
/**
 * Removes every cached preview of a document: the card thumbnail and any
 * rendered pages, all named "<id>.<something>.jpg" by
 * features/documents/thumbnails.ts.
 */
export function deletePreviewFiles(id: string) {
  try {
    if (thumbsDir.exists)
      for (const entry of thumbsDir.list())
        if (entry instanceof File && entry.name.startsWith(`${id}.`))
          try {
            entry.delete();
          } catch {}
  } catch {}
}
/**
 * Swaps a document's file for a new one (used when pages are appended) and
 * keeps its id, name and place in every other table. The new file is staged
 * beside the old one first, so a failed copy leaves the original untouched.
 */
export async function replaceDocumentFile(
  id: string,
  uri: string,
  pageCount: number,
) {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ path: string }>(
    "SELECT path FROM documents WHERE id = ?",
    id,
  );
  if (!row) throw new Error("This document no longer exists.");
  const input = new File(uri);
  if (!input.exists || !input.size) throw new Error("The new file is empty.");
  if (Paths.availableDiskSpace < input.size + 10 * 1024 * 1024)
    throw new Error("Not enough storage. Free some space and try again.");
  const target = new File(root, row.path);
  const staged = new File(root, `${row.path}.new`);
  try {
    if (staged.exists) staged.delete();
    await input.copy(staged);
    if (target.exists) target.delete();
    await staged.move(target);
  } catch (error) {
    try {
      if (!target.exists && staged.exists) await staged.move(target);
      else if (staged.exists) staged.delete();
    } catch {}
    throw error;
  }
  await db.runAsync(
    "UPDATE documents SET size = ?, pageCount = ?, updatedAt = ? WHERE id = ?",
    target.size,
    pageCount,
    Date.now(),
    id,
  );
  deletePreviewFiles(id);
}
/**
 * Applies one change to several documents, continuing past failures so one
 * locked file does not stop the rest. Returns the ids that could not be
 * changed; the caller decides how to report them.
 */
export async function forEachDocument(
  ids: readonly string[],
  action: (id: string) => Promise<unknown>,
) {
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await action(id);
    } catch {
      failed.push(id);
    }
  }
  return failed;
}
/** Permanently deletes everything in the trash. Returns how many were removed. */
export async function emptyTrash() {
  const rows = await (
    await openDatabase()
  ).getAllAsync<{ id: string }>(
    "SELECT id FROM documents WHERE trashedAt IS NOT NULL",
  );
  for (const row of rows) await deleteDocumentForever(row.id);
  return rows.length;
}
/**
 * Applies the trash retention policy. Called once per launch; the policy
 * itself lives in library.mjs so its boundary is unit tested.
 */
export async function purgeExpiredTrash(now = Date.now()) {
  const expired = expiredTrash(await listDocuments(), now);
  for (const document of expired) await deleteDocumentForever(document.id);
  return expired.length;
}
