import { Directory, File, FileMode, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import type { LocalDocument } from "../types/document";
import { cleanName, fileKind, matchesHeader } from "../utils/files.mjs";

const root = new Directory(Paths.document, "ScanDoc");
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  if (!database)
    database = (async () => {
      root.create({ idempotent: true, intermediates: true });
      for (const folder of [
        "Scans",
        "PDF",
        "Images",
        "Compressed",
        "OCR",
        "Exports",
      ])
        new Directory(root, folder).create({ idempotent: true });
      const connection = await SQLite.openDatabaseAsync("scandoc.db");
      await connection.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL, pageCount INTEGER, source TEXT NOT NULL, trashedAt INTEGER
      ); CREATE INDEX IF NOT EXISTS document_updated ON documents(updatedAt DESC); PRAGMA user_version = 1;`);
      return connection;
    })().catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
export async function listDocuments() {
  return (await db()).getAllAsync<LocalDocument>(
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
  const connection = await db();
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
    input.copy(output);
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
    await db()
  ).runAsync(
    "UPDATE documents SET name = ?, updatedAt = ? WHERE id = ?",
    cleanName(name),
    Date.now(),
    id,
  );
}
export async function trashDocument(id: string, restore = false) {
  await (
    await db()
  ).runAsync(
    "UPDATE documents SET trashedAt = ?, updatedAt = ? WHERE id = ?",
    restore ? null : Date.now(),
    Date.now(),
    id,
  );
}
