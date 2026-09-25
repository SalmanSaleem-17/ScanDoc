import * as Crypto from "expo-crypto";
import { File, FileMode, Paths } from "expo-file-system";
import { openDatabase, draftsDir } from "./database";
import { importFile } from "./storage";
import { matchesHeader } from "../utils/files.mjs";
export type Preset = "document" | "receipt" | "study" | "book";
export type Draft = {
  id: string;
  name: string;
  preset: Preset;
  updatedAt: number;
  /** Document these pages will be appended to when the draft is finished. */
  appendTo: string | null;
};
export type DraftPage = {
  id: string;
  draftId: string;
  path: string;
  position: number;
};
export type Receipt = {
  documentId: string;
  merchant: string;
  date: string;
  currency: string;
  cents: number;
};
// One connection and one schema for the whole app; see database.ts.
export const workspaceDb = openDatabase;
export async function listDrafts() {
  return (await workspaceDb()).getAllAsync<Draft>(
    "SELECT * FROM drafts ORDER BY updatedAt DESC",
  );
}
export async function createDraft(
  preset: Preset = "document",
  appendTo: string | null = null,
) {
  const draft: Draft = {
    id: Crypto.randomUUID(),
    name: `${appendTo ? "Added pages" : preset === "receipt" ? "Receipt" : preset === "book" ? "Book" : "Scan"}_${new Date().toISOString().slice(0, 10)}`,
    preset,
    updatedAt: Date.now(),
    appendTo,
  };
  await (
    await workspaceDb()
  ).runAsync(
    "INSERT INTO drafts (id, name, preset, updatedAt, appendTo) VALUES (?,?,?,?,?)",
    draft.id,
    draft.name,
    draft.preset,
    draft.updatedAt,
    draft.appendTo,
  );
  return draft;
}
export async function getDraft(id: string) {
  return (await workspaceDb()).getFirstAsync<Draft>(
    "SELECT * FROM drafts WHERE id=?",
    id,
  );
}
export async function listPages(id: string) {
  return (await workspaceDb()).getAllAsync<DraftPage>(
    "SELECT * FROM draft_pages WHERE draftId=? ORDER BY position",
    id,
  );
}
export function pageUri(page: DraftPage) {
  return new File(draftsDir, page.path).uri;
}
export async function addPage(draftId: string, uri: string) {
  const db = await workspaceDb();
  const id = Crypto.randomUUID();
  const input = new File(uri);
  const handle = input.open(FileMode.ReadOnly);
  let extension: string | undefined;
  try { const header = handle.readBytes(Math.min(12, input.size)); extension = ["jpg", "png", "webp"].find(ext => matchesHeader(`page.${ext}`, header)); } finally { handle.close(); }
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");
  const path = `${id}.${extension}`;
  const output = new File(draftsDir, path);
  try {
    const source = new File(uri);
    if (Paths.availableDiskSpace < source.size + 10 * 1024 * 1024)
      throw new Error("Not enough storage.");
    // copy() is asynchronous on the native side. Without the await the row
    // was inserted, the caller returned and the camera's temporary file was
    // deleted while the copy was still running, which failed the capture on
    // slower devices. The file must exist before anything refers to it.
    await source.copy(output);
    await db.withExclusiveTransactionAsync(async (tx) => {
      if (
        !(await tx.getFirstAsync("SELECT id FROM drafts WHERE id=?", draftId))
      )
        throw new Error("Draft no longer exists.");
      const count = await tx.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM draft_pages WHERE draftId=?",draftId);
      if (count!.count >= 300) throw new Error("A draft supports up to 300 pages.");
      const row = await tx.getFirstAsync<{ position: number }>(
        "SELECT COALESCE(MAX(position),-1)+1 AS position FROM draft_pages WHERE draftId=?",
        draftId,
      );
      await tx.runAsync(
        "INSERT INTO draft_pages VALUES (?,?,?,?)",
        id,
        draftId,
        path,
        row!.position,
      );
      await tx.runAsync(
        "UPDATE drafts SET updatedAt=? WHERE id=?",
        Date.now(),
        draftId,
      );
    });
    return id;
  } catch (error) {
    if (output.exists) output.delete();
    throw error;
  }
}
export async function preservePageOriginal(page: DraftPage) {
  await (await workspaceDb()).runAsync("INSERT OR IGNORE INTO draft_page_sources SELECT id,path FROM draft_pages WHERE id=?", page.id);
}
export async function originalPageUri(page: DraftPage) {
  const source = await (await workspaceDb()).getFirstAsync<{path: string}>("SELECT path FROM draft_page_sources WHERE pageId=?", page.id);
  return source ? new File(draftsDir, source.path).uri : undefined;
}
export async function replacePage(page: DraftPage, uri: string) {
  const db = await workspaceDb();
  const next = `${Crypto.randomUUID()}.jpg`;
  const output = new File(draftsDir, next);
  try {
    await new File(uri).copy(output);
  } catch (error) {
    try {
      if (output.exists) output.delete();
    } catch {}
    throw error;
  }
  try {
    const updated = await db.runAsync(
      "UPDATE draft_pages SET path=? WHERE id=?",
      next,
      page.id,
    );
    if (!updated.changes) throw new Error("Page no longer exists.");
  } catch (error) {
    output.delete();
    throw error;
  }
  try {
    const source = await (await workspaceDb()).getFirstAsync<{path: string}>("SELECT path FROM draft_page_sources WHERE pageId=?", page.id);
    if (source?.path !== page.path) new File(draftsDir, page.path).delete();
  } catch {}
}
export async function removePage(page: DraftPage) {
  const db = await workspaceDb();
  const source = await db.getFirstAsync<{path: string}>("SELECT path FROM draft_page_sources WHERE pageId=?", page.id);
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync("DELETE FROM draft_page_sources WHERE pageId=?", page.id);
    await tx.runAsync("DELETE FROM draft_pages WHERE id=?", page.id);
  });
  for (const path of new Set([page.path, source?.path].filter((p): p is string => !!p))) {
    try { new File(draftsDir, path).delete(); } catch {}
  }
}
export async function reorderPages(
  pages: DraftPage[],
  index: number,
  direction: number,
) {
  const next = [...pages];
  const target = index + direction;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  await (
    await workspaceDb()
  ).withExclusiveTransactionAsync(async (tx) => {
    for (let i = 0; i < next.length; i++)
      await tx.runAsync(
        "UPDATE draft_pages SET position=? WHERE id=?",
        i,
        next[i].id,
      );
  });
}
export async function discardDraft(id: string) {
  const db = await workspaceDb();
  const pages = await listPages(id);
  const sources = await db.getAllAsync<{path: string}>("SELECT s.path FROM draft_page_sources s JOIN draft_pages p ON p.id=s.pageId WHERE p.draftId=?", id);
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync("DELETE FROM draft_page_sources WHERE pageId IN (SELECT id FROM draft_pages WHERE draftId=?)", id);
    await tx.runAsync("DELETE FROM draft_pages WHERE draftId=?", id);
    await tx.runAsync("DELETE FROM drafts WHERE id=?", id);
  });
  for (const path of new Set([...pages, ...sources].map(p => p.path))) {
    try { new File(draftsDir, path).delete(); } catch {}
  }
}
export async function saveText(documentId: string, text: string) {
  await (
    await workspaceDb()
  ).withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "INSERT OR REPLACE INTO document_text VALUES (?,?,?)",
      documentId,
      text,
      Date.now(),
    );
    await tx.runAsync(
      "DELETE FROM document_search WHERE documentId=?",
      documentId,
    );
    if (text.trim())
      await tx.runAsync(
        "INSERT INTO document_search VALUES (?,?)",
        documentId,
        text,
      );
  });
}
export async function getText(id: string) {
  return (
    (
      await (
        await workspaceDb()
      ).getFirstAsync<{ text: string }>(
        "SELECT text FROM document_text WHERE documentId=?",
        id,
      )
    )?.text || ""
  );
}
export async function searchText(query: string) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" AND ");
  if (!terms) return [];
  return (await workspaceDb()).getAllAsync<{
    documentId: string;
    excerpt: string;
  }>(
    "SELECT documentId, snippet(document_search,1,'〔','〕','…',16) AS excerpt FROM document_search WHERE document_search MATCH ? LIMIT 200",
    terms,
  );
}
export async function putFolder(id: string, folder: string) {
  await (
    await workspaceDb()
  ).runAsync(
    "INSERT OR REPLACE INTO document_folders VALUES (?,?)",
    id,
    folder,
  );
}
export async function folders() {
  return (await workspaceDb()).getAllAsync<{
    documentId: string;
    folder: string;
  }>("SELECT * FROM document_folders");
}
export async function putReceipt(receipt: Receipt) {
  await (
    await workspaceDb()
  ).runAsync(
    "INSERT OR REPLACE INTO receipts VALUES (?,?,?,?,?)",
    receipt.documentId,
    receipt.merchant,
    receipt.date,
    receipt.currency,
    receipt.cents,
  );
}
export async function getReceipt(id: string) {
  return (await workspaceDb()).getFirstAsync<Receipt>(
    "SELECT * FROM receipts WHERE documentId=?",
    id,
  );
}
export async function listReceipts() {
  return (await workspaceDb()).getAllAsync<Receipt>(
    "SELECT r.* FROM receipts r INNER JOIN documents d ON d.id=r.documentId WHERE d.trashedAt IS NULL ORDER BY date DESC",
  );
}
export async function storePdf(uri: string, name: string, count: number) {
  const doc = await importFile(
    uri,
    name.endsWith(".pdf") ? name : `${name}.pdf`,
  );
  await (
    await workspaceDb()
  ).runAsync("UPDATE documents SET pageCount=? WHERE id=?", count, doc.id);
  return doc;
}
