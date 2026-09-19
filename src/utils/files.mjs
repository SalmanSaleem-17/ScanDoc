export function cleanName(value) {
  const name = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 100);
  if (!name || name === "." || name === "..")
    throw new Error("Enter a valid document name.");
  return name;
}
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function fileKind(name) {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return "image";
  throw new Error("Choose a PDF, JPG, PNG, or WebP file.");
}
export function matchesHeader(name, bytes) {
  const extension = name.toLowerCase().split(".").pop();
  const starts = (...signature) =>
    signature.every((value, index) => bytes[index] === value);
  if (extension === "pdf") return starts(37, 80, 68, 70, 45);
  if (extension === "jpg" || extension === "jpeg") return starts(255, 216, 255);
  if (extension === "png") return starts(137, 80, 78, 71, 13, 10, 26, 10);
  if (extension === "webp")
    return (
      starts(82, 73, 70, 70) &&
      bytes[8] === 87 &&
      bytes[9] === 69 &&
      bytes[10] === 66 &&
      bytes[11] === 80
    );
  return false;
}
