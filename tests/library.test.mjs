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
