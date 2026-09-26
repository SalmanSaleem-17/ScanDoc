export declare const SEPARATOR: string;
export declare const MAX_DEPTH: number;
export declare const MAX_NAME: number;
export declare function cleanName(name: string | null | undefined): string;
export declare function segments(path: string | null | undefined): string[];
export declare function joinPath(...parts: (string | null | undefined)[]): string;
export declare function parentOf(path: string): string;
export declare function nameOf(path: string): string;
export declare function depthOf(path: string): number;
export declare function isWithin(path: string, ancestor: string): boolean;
export declare function isLockedPath(path: string, lockedPaths: Iterable<string>): boolean;
export declare function validateNewFolder(
  parent: string,
  name: string,
  existingPaths: Iterable<string>,
): { ok: true; path: string } | { ok: false; reason: string };
export interface FolderChild {
  path: string;
  name: string;
  direct: number;
  total: number;
}
export declare function childrenOf(parent: string, folderPaths: Iterable<string>, documentPaths: Iterable<string>): FolderChild[];
export declare function directDocuments(folder: string, assignments: Iterable<[string, string]>): string[];
export declare function renamePath(path: string, from: string, to: string): string;
