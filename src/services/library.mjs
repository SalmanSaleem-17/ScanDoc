// Library policies with no native dependencies, so they run under node:test
// and the behaviour users rely on (when trash is emptied, when a database is
// too new to open) is pinned by tests rather than by reading the code.
export const TRASH_RETENTION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Migrations the database still needs, in the order to apply them. The list
 * must be contiguous from version 1: a gap or a duplicate means a migration
 * was edited or dropped after shipping, which would leave some users' data on
 * a schema no code path expects. A database newer than this app is refused
 * rather than "repaired", because an older app cannot know what it would lose.
 */
export function pendingMigrations(currentVersion, migrations) {
  if (!Number.isInteger(currentVersion) || currentVersion < 0)
    throw new Error(`Invalid database version: ${currentVersion}`);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1)
      throw new Error(
        `Migration at index ${index} has version ${migration.version}; expected ${index + 1}`,
      );
  });
  if (currentVersion > migrations.length)
    throw new Error(
      "This library was created by a newer version of ScanDoc. Update the app to open it.",
    );
  return migrations.slice(currentVersion);
}

/** Trashed documents whose retention period has passed. */
export function expiredTrash(
  documents,
  now = Date.now(),
  retentionDays = TRASH_RETENTION_DAYS,
) {
  const cutoff = now - retentionDays * DAY;
  return documents.filter(
    (document) =>
      typeof document.trashedAt === "number" && document.trashedAt <= cutoff,
  );
}

/** Whole days before a trashed document is removed, never below zero. */
export function daysUntilPurge(
  trashedAt,
  now = Date.now(),
  retentionDays = TRASH_RETENTION_DAYS,
) {
  return Math.max(0, Math.ceil((trashedAt + retentionDays * DAY - now) / DAY));
}

/** Bytes in use, split so Settings can say what emptying the trash frees. */
export function libraryBytes(documents) {
  const totals = { active: 0, activeCount: 0, trash: 0, trashCount: 0 };
  for (const document of documents) {
    if (document.trashedAt) {
      totals.trash += document.size;
      totals.trashCount++;
    } else {
      totals.active += document.size;
      totals.activeCount++;
    }
  }
  return totals;
}
/**
 * The name a document is saved under outside the app. The storage provider
 * appends an extension from the MIME type, so one already in the name is
 * removed rather than doubled ("Invoice.pdf.pdf").
 */
export function exportFileName(name, kind) {
  const trimmed = String(name ?? "")
    .trim()
    .replace(/\.(pdf|jpe?g|png|webp)$/i, "")
    .trim();
  return (trimmed || (kind === "pdf" ? "Document" : "Image")).slice(0, 120);
}
/**
 * A readable folder name from a Storage Access Framework tree URI, for the
 * Settings screen: ".../tree/primary%3ADownload%2FScanDoc" reads as
 * "Download/ScanDoc". Unknown shapes give "" so callers can fall back.
 */
export function describeDirectory(uri) {
  const match = /\/tree\/([^/?#]+)/.exec(String(uri ?? ""));
  if (!match) return "";
  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return "";
  }
  const colon = id.indexOf(":");
  const volume = colon >= 0 ? id.slice(0, colon) : "";
  const path = colon >= 0 ? id.slice(colon + 1) : id;
  if (path && volume) return path;
  if (volume === "primary") return "Internal storage";
  if (path.toLowerCase() === "downloads") return "Downloads";
  return path || volume;
}
