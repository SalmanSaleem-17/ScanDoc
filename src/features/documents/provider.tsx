import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LocalDocument } from "../../types/document";
import { listDocuments, purgeExpiredTrash } from "../../services/storage";
import { documentFolders, lockedPaths as loadLockedPaths } from "../../services/folders";
import { isLockedPath } from "../../services/folderPaths.mjs";
import { isUnlocked, subscribe } from "../../services/pin";

// The library as screens see it. Documents inside a locked folder are left
// out of `documents` until the PIN has been entered this session, so lists,
// search, previews and Home never show them by accident; `allDocuments` is
// for the few places that must reason about a locked document on purpose
// (the document screen asking for the PIN, the trash purge).
type Library = {
  documents: LocalDocument[];
  allDocuments: LocalDocument[];
  /** Folder path per document id; absent when the document is in no folder. */
  folderOf: Record<string, string>;
  lockedPaths: string[];
  unlocked: boolean;
  /** Documents hidden because their folder is locked. */
  hiddenCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  isLocked: (documentOrPath: LocalDocument | string | null | undefined) => boolean;
};
const Context = createContext<Library>({
  documents: [],
  allDocuments: [],
  folderOf: {},
  lockedPaths: [],
  unlocked: false,
  hiddenCount: 0,
  loading: true,
  error: "",
  refresh: async () => {},
  isLocked: () => false,
});
export function DocumentsProvider({ children }: React.PropsWithChildren) {
  const [allDocuments, setAllDocuments] = useState<LocalDocument[]>([]);
  const [folderOf, setFolderOf] = useState<Record<string, string>>({});
  const [lockedPaths, setLockedPaths] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [docs, folders, locked] = await Promise.all([listDocuments(), documentFolders(), loadLockedPaths()]);
      setAllDocuments(docs);
      setFolderOf(folders);
      setLockedPaths(locked);
      setError("");
    } catch {
      setError("Could not open your library. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => subscribe(() => setUnlocked(isUnlocked())), []);
  useEffect(() => {
    // Retention runs before the first listing so expired items never flash
    // into view. A purge failure must not stop the library from opening.
    purgeExpiredTrash()
      .catch(() => {})
      .finally(() => void refresh());
  }, [refresh]);
  const value = useMemo<Library>(() => {
    const isLocked = (target: LocalDocument | string | null | undefined) => {
      const path = typeof target === "string" ? target : target ? folderOf[target.id] : undefined;
      return !!path && isLockedPath(path, lockedPaths);
    };
    const documents = unlocked ? allDocuments : allDocuments.filter((d) => !isLocked(d));
    return {
      documents,
      allDocuments,
      folderOf,
      lockedPaths,
      unlocked,
      hiddenCount: allDocuments.length - documents.length,
      loading,
      error,
      refresh,
      isLocked,
    };
  }, [allDocuments, folderOf, lockedPaths, unlocked, loading, error, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useDocuments = () => useContext(Context);
