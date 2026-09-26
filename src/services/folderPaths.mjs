// Folder paths are "/"-separated names ("Study/Math"). A document carries one
// path; the folders table carries every folder that exists, locked or not,
// so an empty folder and a locked folder both persist. These helpers are the
// only place path rules live, and they are unit tested.

export const SEPARATOR = "/";
export const MAX_DEPTH = 4;
export const MAX_NAME = 40;

/** One folder name: trimmed, single spaces, no separators, bounded. */
export function cleanName(name) {
  return String(name ?? "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

/** Splits a path into clean names, dropping empties. */
export function segments(path) {
  return String(path ?? "")
    .split(SEPARATOR)
    .map(cleanName)
    .filter(Boolean);
}

export function joinPath(...parts) {
  return parts.flatMap((part) => segments(part)).join(SEPARATOR);
}

export function parentOf(path) {
  const parts = segments(path);
  return parts.slice(0, -1).join(SEPARATOR);
}

export function nameOf(path) {
  const parts = segments(path);
  return parts[parts.length - 1] ?? "";
}

export function depthOf(path) {
  return segments(path).length;
}

/** True when `path` is `ancestor` itself or lies inside it. */
export function isWithin(path, ancestor) {
  const p = segments(path);
  const a = segments(ancestor);
  if (!a.length || a.length > p.length) return false;
  return a.every((name, index) => name.toLowerCase() === p[index].toLowerCase());
}

/** A path is locked when it or any ancestor is in the locked set. */
export function isLockedPath(path, lockedPaths) {
  for (const locked of lockedPaths) if (isWithin(path, locked)) return true;
  return false;
}

/** Validation for creating a folder at `parent` named `name`. */
export function validateNewFolder(parent, name, existingPaths) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, reason: "Enter a folder name." };
  const path = joinPath(parent, clean);
  if (depthOf(path) > MAX_DEPTH)
    return { ok: false, reason: `Folders can be nested ${MAX_DEPTH} levels deep.` };
  const lower = path.toLowerCase();
  for (const existing of existingPaths)
    if (existing.toLowerCase() === lower) return { ok: false, reason: "That folder already exists here." };
  return { ok: true, path };
}

/**
 * Builds the children of `parent` from the folder table and the documents'
 * folder assignments: each child carries its own document count and the
 * count including everything nested below it.
 */
export function childrenOf(parent, folderPaths, documentPaths) {
  const parentParts = segments(parent);
  const names = new Map();
  const consider = (path) => {
    const parts = segments(path);
    if (parts.length <= parentParts.length) return;
    if (!parentParts.every((name, i) => name.toLowerCase() === parts[i].toLowerCase())) return;
    const child = parts.slice(0, parentParts.length + 1).join(SEPARATOR);
    if (!names.has(child)) names.set(child, { path: child, name: parts[parentParts.length], direct: 0, total: 0 });
  };
  folderPaths.forEach(consider);
  documentPaths.forEach(consider);
  for (const path of documentPaths) {
    for (const child of names.values()) {
      if (!isWithin(path, child.path)) continue;
      child.total++;
      if (segments(path).length === segments(child.path).length) child.direct++;
    }
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Documents directly in `folder` (not in sub-folders). */
export function directDocuments(folder, assignments) {
  const target = segments(folder).join(SEPARATOR).toLowerCase();
  return assignments.filter(([, path]) => segments(path).join(SEPARATOR).toLowerCase() === target).map(([id]) => id);
}

/** New path for a folder (or document path) after `from` is renamed to `to`. */
export function renamePath(path, from, to) {
  if (!isWithin(path, from)) return path;
  const rest = segments(path).slice(segments(from).length);
  return joinPath(to, ...rest);
}
