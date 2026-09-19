export function cleanName(value: string): string;
export function formatBytes(bytes: number): string;
export function fileKind(name: string): 'pdf' | 'image';
export function matchesHeader(name: string, bytes: Uint8Array): boolean;
