import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
// expo-file-system's File.copy() and File.move() are AsyncFunctions on Android:
// they return promises. A call that is not awaited lets the caller carry on,
// insert database rows and delete the source before the copy has happened. That
// is exactly how a capture failed in Expo Go, so the rule is enforced on the
// source: every copy/move must be awaited. The synchronous copySync/moveSync
// variants are not matched by this pattern.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(path);
  }
  return out;
}
test("every File.copy() and File.move() is awaited", () => {
  const offenders = [];
  for (const file of [...walk("app"), ...walk("src")]) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/\.(copy|move)\(/.test(line) && !/\bawait\b/.test(line))
        offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], "un-awaited native copy/move calls:\n" + offenders.join("\n"));
});
