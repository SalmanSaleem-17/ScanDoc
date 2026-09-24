export interface Migration {
  version: number;
  statements: string;
}
export interface TrashCandidate {
  size: number;
  trashedAt: number | null;
}
export declare const TRASH_RETENTION_DAYS: number;
export declare function pendingMigrations<T extends Migration>(
  currentVersion: number,
  migrations: T[],
): T[];
export declare function expiredTrash<T extends TrashCandidate>(
  documents: T[],
  now?: number,
  retentionDays?: number,
): T[];
export declare function daysUntilPurge(
  trashedAt: number,
  now?: number,
  retentionDays?: number,
): number;
export declare function libraryBytes(documents: TrashCandidate[]): {
  active: number;
  activeCount: number;
  trash: number;
  trashCount: number;
};
