import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { LocalDocument } from "../../types/document";
import { listDocuments, purgeExpiredTrash } from "../../services/storage";
const Context = createContext({
  documents: [] as LocalDocument[],
  loading: true,
  error: "",
  refresh: async () => {},
});
export function DocumentsProvider({ children }: React.PropsWithChildren) {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
      setError("");
    } catch {
      setError("Could not open your library. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Retention runs before the first listing so expired items never flash
    // into view. A purge failure must not stop the library from opening.
    purgeExpiredTrash()
      .catch(() => {})
      .finally(() => void refresh());
  }, [refresh]);
  return (
    <Context.Provider value={{ documents, loading, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const useDocuments = () => useContext(Context);
