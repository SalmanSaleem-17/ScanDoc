import test from "node:test";
import assert from "node:assert/strict";
import {
  TRASH_RETENTION_DAYS,
  daysUntilPurge,
  expiredTrash,
  libraryBytes,
  pendingMigrations,
} from "../src/services/library.mjs";
const DAY = 24 * 60 * 60 * 1000;
const m = (...versions) => versions.map((version) => ({ version, statements: `-- ${version}` }));
test("pending migrations resume from the stored version and refuse newer databases", () => {
  assert.deepEqual(pendingMigrations(0, m(1, 2, 3)).map((x) => x.version), [1, 2, 3]);
  assert.deepEqual(pendingMigrations(2, m(1, 2, 3)).map((x) => x.version), [3]);
  assert.deepEqual(pendingMigrations(3, m(1, 2, 3)), []);
  assert.throws(() => pendingMigrations(4, m(1, 2, 3)), /newer version/);
  assert.throws(() => pendingMigrations(-1, m(1)), /Invalid/);
  assert.throws(() => pendingMigrations(1.5, m(1)), /Invalid/);
});
test("a migration list with a gap, duplicate or wrong start is rejected before anything runs", () => {
  assert.throws(() => pendingMigrations(0, m(1, 3)), /index 1 has version 3/);
  assert.throws(() => pendingMigrations(0, m(1, 2, 2)), /index 2 has version 2/);
  assert.throws(() => pendingMigrations(0, m(2)), /index 0 has version 2/);
});
test("trash expires exactly at the retention boundary and ignores live documents", () => {
  const now = 1_700_000_000_000;
  const docs = [
    { id: "live", size: 1, trashedAt: null },
    { id: "fresh", size: 1, trashedAt: now - (TRASH_RETENTION_DAYS - 1) * DAY },
    { id: "boundary", size: 1, trashedAt: now - TRASH_RETENTION_DAYS * DAY },
    { id: "old", size: 1, trashedAt: now - (TRASH_RETENTION_DAYS + 5) * DAY },
  ];
  assert.deepEqual(expiredTrash(docs, now).map((d) => d.id), ["boundary", "old"]);
  assert.deepEqual(expiredTrash(docs, now, 60), []);
  assert.equal(daysUntilPurge(now - 29 * DAY, now), 1);
  assert.equal(daysUntilPurge(now - 30 * DAY, now), 0);
  assert.equal(daysUntilPurge(now - 31 * DAY, now), 0);
  assert.equal(daysUntilPurge(now, now), 30);
});
test("library bytes are split between live documents and trash", () => {
  assert.deepEqual(
    libraryBytes([
      { size: 100, trashedAt: null },
      { size: 50, trashedAt: null },
      { size: 7, trashedAt: 1 },
    ]),
    { active: 150, activeCount: 2, trash: 7, trashCount: 1 },
  );
  assert.deepEqual(libraryBytes([]), { active: 0, activeCount: 0, trash: 0, trashCount: 0 });
});
test("export names drop a duplicated extension and never come out empty", async () => {
  const { exportFileName } = await import("../src/services/library.mjs");
  assert.equal(exportFileName("Invoice.PDF", "pdf"), "Invoice");
  assert.equal(exportFileName("scan 3.jpeg", "image"), "scan 3");
  assert.equal(exportFileName("notes.pdf.pdf", "pdf"), "notes.pdf");
  assert.equal(exportFileName("   ", "pdf"), "Document");
  assert.equal(exportFileName(".png", "image"), "Image");
  assert.equal(exportFileName("x".repeat(200), "pdf").length, 120);
});
test("tree URIs are described as the folder people chose", async () => {
  const { describeDirectory } = await import("../src/services/library.mjs");
  assert.equal(describeDirectory("content://com.android.externalstorage.documents/tree/primary%3ADownload%2FScanDoc"), "Download/ScanDoc");
  assert.equal(describeDirectory("content://com.android.externalstorage.documents/tree/primary%3A"), "Internal storage");
  assert.equal(describeDirectory("content://com.android.providers.downloads.documents/tree/downloads"), "Downloads");
  assert.equal(describeDirectory("content://com.android.externalstorage.documents/tree/1234-5678%3ADCIM"), "DCIM");
  assert.equal(describeDirectory("nonsense"), "");
  assert.equal(describeDirectory(null), "");
  assert.equal(describeDirectory("content://x/tree/%E0%A4%A"), "");
});
