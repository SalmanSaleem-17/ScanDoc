import * as SQLite from "expo-sqlite";
import { Directory, Paths } from "expo-file-system";
import { pendingMigrations } from "./library.mjs";

// One database, opened once, with one versioned schema. Previously storage.ts
// and workspace.ts each opened scandoc.db with half the tables and storage.ts
// re-asserted "PRAGMA user_version = 1" on every launch, which would have
// silently undone any later migration. Everything that needs the database goes
// through openDatabase() so a schema change is a single new entry below.
export const root = new Directory(Paths.document, "ScanDoc");
export const draftsDir = new Directory(root, "Drafts");
// Previews are regenerable, so they live in the cache and may be dropped by the OS.
export const thumbsDir = new Directory(Paths.cache, "ScanDocThumbs");
const folders = ["Scans", "PDF", "Images", "Compressed", "OCR", "Exports"];

// Rules: entries are appended, never edited once shipped; each runs inside its
// own transaction; version 1 is the baseline that every existing install
// already has, expressed with IF NOT EXISTS so it is safe to re-run on a
// database created before versioning existed.
export const migrations = [
  {
    version: 1,
    statements: `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL, pageCount INTEGER, source TEXT NOT NULL, trashedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS document_updated ON documents(updatedAt DESC);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, name TEXT NOT NULL, preset TEXT NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS draft_pages (id TEXT PRIMARY KEY, draftId TEXT NOT NULL, path TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS draft_page_sources (pageId TEXT PRIMARY KEY, path TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS draft_page_order ON draft_pages(draftId,position);
      CREATE TABLE IF NOT EXISTS document_text (documentId TEXT PRIMARY KEY, text TEXT NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(documentId UNINDEXED,text, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS document_folders (documentId TEXT PRIMARY KEY, folder TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (documentId TEXT PRIMARY KEY, merchant TEXT NOT NULL, date TEXT NOT NULL, currency TEXT NOT NULL, cents INTEGER NOT NULL);`,
  },
  {
    // A draft started from an existing document ("Add pages") remembers which
    // one, so finishing it appends to that PDF instead of creating a new file.
    version: 2,
    statements: `ALTER TABLE drafts ADD COLUMN appendTo TEXT;`,
  },
];

let opening: Promise<SQLite.SQLiteDatabase> | undefined;
export function openDatabase() {
  if (!opening)
    opening = (async () => {
      root.create({ idempotent: true, intermediates: true });
      for (const folder of folders)
        new Directory(root, folder).create({ idempotent: true });
      draftsDir.create({ idempotent: true });
      const db = await SQLite.openDatabaseAsync("scandoc.db");
      // WAL cannot be changed inside a transaction, so it is set first.
      await db.execAsync("PRAGMA journal_mode = WAL;");
      const row = await db.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version",
      );
      // Installs from before versioning report 0 but already hold the
      // baseline tables; the baseline is idempotent, so running it again is
      // the cheapest correct way to bring them onto the versioned track.
      const current = row?.user_version ?? 0;
      for (const migration of pendingMigrations(current, migrations))
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.execAsync(migration.statements);
          await tx.execAsync(`PRAGMA user_version = ${migration.version}`);
        });
      return db;
    })().catch((error) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
