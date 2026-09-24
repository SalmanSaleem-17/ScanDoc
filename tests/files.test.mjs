import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanName,
  fileKind,
  formatBytes,
  matchesHeader,
  sequenceName,
  timestampName,
} from "../src/utils/files.mjs";
test("names cannot contain path separators or control characters", () => {
  assert.equal(cleanName(" /Work\\Invoice:2026?.pdf "), "WorkInvoice2026.pdf");
  assert.throws(() => cleanName(" .. "));
  assert.throws(() => cleanName("///"));
  assert.equal(cleanName("x".repeat(150)).length, 100);
});
test("accept only supported formats regardless of case", () => {
  assert.equal(fileKind("Document.PDF"), "pdf");
  assert.equal(fileKind("Photo.JPEG"), "image");
  assert.throws(() => fileKind("document.exe"));
  assert.throws(() => fileKind("image.jpg.exe"));
});
test("format sizes without inventing savings", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1048576), "1.0 MB");
});
test("reject renamed or truncated files before importing", () => {
  assert.equal(
    matchesHeader("file.pdf", new Uint8Array([37, 80, 68, 70, 45])),
    true,
  );
  assert.equal(
    matchesHeader("file.png", new Uint8Array([255, 216, 255])),
    false,
  );
  assert.equal(matchesHeader("file.jpg", new Uint8Array([255])), false);
  assert.equal(
    matchesHeader("file.jpg", new Uint8Array([255, 216, 255])),
    true,
  );
});

test("suggested names are readable and sort chronologically", () => {
  const name = timestampName("Scan", "pdf", new Date(2026, 8, 19, 15, 30, 45));
  assert.equal(name, "Scan_2026-09-19_153045.pdf");
  assert.equal(cleanName(name), name);
});

test("multi-file exports keep their order when sorted by name", () => {
  assert.equal(sequenceName("Document", 1, 9, "jpg"), "Document_01.jpg");
  assert.equal(sequenceName("Document", 7, 120, "jpg"), "Document_007.jpg");
  const names = [1, 2, 10].map((i) => sequenceName("Page", i, 10, "jpg"));
  assert.deepEqual([...names].sort(), names);
});
