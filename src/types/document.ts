export type DocumentKind = "pdf" | "image";
export interface LocalDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  path: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  pageCount: number | null;
  source: "import" | "camera" | "compressed";
  trashedAt: number | null;
}
