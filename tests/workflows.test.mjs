import test from "node:test";
import assert from "node:assert/strict";
import {
  suggestName,
  parseAmount,
  receiptSuggestion,
  receiptCsv,
  changedLines,
  validCorners,
} from "../src/features/workflows/logic.mjs";
test("suggest names from content without path or control characters", () => {
  const name = suggestName(
    "ACME / Stores\nInvoice 41",
    "pdf",
    new Date("2026-09-19T00:00:00Z"),
  );
  assert.equal(name, "Invoice_ACME_Stores_2026-09-19.pdf");
  assert.equal(
    suggestName("", "pdf", new Date("2026-09-19")),
    "Document_Document_2026-09-19.pdf",
  );
});
test("money uses exact cents and rejects ambiguous values", () => {
  assert.equal(parseAmount("12.3"), 1230);
  assert.equal(parseAmount("0.01"), 1);
  for (const value of ["1,000", "-2", "NaN", "1e3", "12.345", ""])
    assert.throws(() => parseAmount(value));
});
test("receipt suggestions prefer total over subtotal without guessing currency", () => {
  assert.deepEqual(
    receiptSuggestion("ACME\n2026-09-19\nSubtotal 10.00\nTotal 12.50"),
    { merchant: "ACME", date: "2026-09-19", amount: "12.50" },
  );
  assert.equal(receiptSuggestion("no amounts").amount, "");
});
test("CSV escapes embedded content and spreadsheet formula injection", () => {
  const csv = receiptCsv([
    {
      merchant: '=HYPERLINK("x")',
      date: "2026-09-19",
      currency: "PKR",
      cents: 1250,
      name: "a,b.pdf",
    },
  ]);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"12.50"'));
  assert.ok(csv.includes('"a,b.pdf"'));
});
test("comparison counts duplicates and ignores ordering as documented", () => {
  assert.deepEqual(changedLines("A\nA\nB", "A\nB\nC"), {
    removed: ["A"],
    added: ["C"],
  });
  assert.deepEqual(changedLines("A\nB", "B\nA"), { removed: [], added: [] });
});
test("perspective corners reject crossed and degenerate quadrilaterals", () => {
  assert.equal(validCorners([0, 0, 1, 0, 1, 1, 0, 1]), true);
  assert.equal(validCorners([0, 0, 1, 1, 1, 0, 0, 1]), false);
  assert.equal(validCorners([0, 0, 0, 0, 1, 1, 0, 1]), false);
  assert.equal(validCorners([0, 0, 2, 0, 1, 1, 0, 1]), false);
});
