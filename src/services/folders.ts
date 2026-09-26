import { openDatabase, transaction } from "./database";
import {
  childrenOf,
  cleanName,
  isWithin,
  joinPath,
  parentOf,
  renamePath,
  segments,
  validateNewFolder,
  type FolderChild,
} from "./folderPaths.mjs";

// Folders are rows in `folders` (path, locked) plus the documents' folder
// assignments in document_folders. A folder therefore exists until it is
// deleted, whether or not anything is in it, and "locked" is a property of
// the folder that applies to everything nested below it. The PIN that opens
// locked folders lives in pin.ts; this file only knows which paths are locked.

export type FolderRow = { path: string; locked: number; createdAt: number };
export type { FolderChild };

export async function listFolders(): Promise<FolderRow[]> {
  return (await openDatabase()).getAllAsync<FolderRow>("SELECT * FROM folders ORDER BY lower(path)");
}

/** Every document id with its folder path (documents outside folders are absent). */
export async function documentFolders(): Promise<Record<string, string>> {
  const rows = await (await openDatabase()).getAllAsync<{ documentId: string; folder: string }>(
    "SELECT documentId, folder FROM document_folders",
  );
  return Object.fromEntries(rows.map((row) => [row.documentId, row.folder]));
}

export async function lockedPaths(): Promise<string[]> {
  const rows = await (await openDatabase()).getAllAsync<{ path: string }>("SELECT path FROM folders WHERE locked = 1");
  return rows.map((row) => row.path);
}

/** Creates `name` under `parent` (and any missing ancestors). Returns the path. */
export async function createFolder(parent: string, name: string): Promise<string> {
  const existing = (await listFolders()).map((row) => row.path);
  const verdict = validateNewFolder(parent, name, existing);
  if (!verdict.ok) throw new Error(verdict.reason);
  await ensureFolders(verdict.path);
  return verdict.path;
}

/** Makes sure a path and all its ancestors have rows, without touching locks. */
export async function ensureFolders(path: string) {
  const parts = segments(path);
  if (!parts.length) return;
  await transaction(async (tx) => {
    for (let depth = 1; depth <= parts.length; depth++)
      await tx.runAsync(
        "INSERT OR IGNORE INTO folders (path, locked, createdAt) VALUES (?, 0, ?)",
        parts.slice(0, depth).join("/"),
        Date.now(),
      );
  });
}

/** Puts a document in a folder (creating it if needed) or removes it from any. */
export async function assignFolder(documentId: string, path: string | null) {
  const clean = path ? joinPath(path) : "";
  if (!clean) {
    await (await openDatabase()).runAsync("DELETE FROM document_folders WHERE documentId = ?", documentId);
    return;
  }
  await ensureFolders(clean);
  await (await openDatabase()).runAsync(
    "INSERT OR REPLACE INTO document_folders VALUES (?, ?)",
    documentId,
    clean,
  );
}

export async function setFolderLocked(path: string, locked: boolean) {
  await ensureFolders(path);
  await (await openDatabase()).runAsync("UPDATE folders SET locked = ? WHERE path = ?", locked ? 1 : 0, joinPath(path));
}

/** Renames a folder; documents and sub-folders follow. */
export async function renameFolder(path: string, name: string) {
  const from = joinPath(path);
  const to = joinPath(parentOf(from), cleanName(name));
  if (!segments(to).length || to === from) return from;
  const rows = await listFolders();
  if (rows.some((row) => row.path.toLowerCase() === to.toLowerCase())) throw new Error("That folder already exists here.");
  const docs = await documentFolders();
  await transaction(async (tx) => {
    for (const row of rows)
      if (isWithin(row.path, from))
        await tx.runAsync("UPDATE folders SET path = ? WHERE path = ?", renamePath(row.path, from, to), row.path);
    for (const [id, folder] of Object.entries(docs))
      if (isWithin(folder, from))
        await tx.runAsync("UPDATE document_folders SET folder = ? WHERE documentId = ?", renamePath(folder, from, to), id);
  });
  return to;
}

/** Deletes a folder; its documents and sub-folder documents move to the parent. */
export async function deleteFolder(path: string) {
  const target = joinPath(path);
  const parent = parentOf(target);
  const rows = await listFolders();
  const docs = await documentFolders();
  await transaction(async (tx) => {
    for (const [id, folder] of Object.entries(docs))
      if (isWithin(folder, target)) {
        if (parent) await tx.runAsync("UPDATE document_folders SET folder = ? WHERE documentId = ?", parent, id);
        else await tx.runAsync("DELETE FROM document_folders WHERE documentId = ?", id);
      }
    for (const row of rows)
      if (isWithin(row.path, target)) await tx.runAsync("DELETE FROM folders WHERE path = ?", row.path);
  });
}

/** Children of `parent` with counts, excluding trashed documents. */
export async function folderChildren(parent: string, trashedIds: Set<string>): Promise<FolderChild[]> {
  const rows = await listFolders();
  const docs = await documentFolders();
  const live = Object.entries(docs).filter(([id]) => !trashedIds.has(id)).map(([, path]) => path);
  return childrenOf(parent, rows.map((row) => row.path), live);
}
