export function suggestName(text, extension = "pdf", date = new Date()) {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = lines.find((s) => /[a-zA-Z]{3}/.test(s)) || "Document";
  const category = /\binvoice\b/i.test(text)
    ? "Invoice"
    : /\breceipt\b|\btotal\b/i.test(text)
      ? "Receipt"
      : /\bagreement\b|\bcontract\b/i.test(text)
        ? "Agreement"
        : "Document";
  const title = first
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .trim()
    .slice(0, 45)
    .replace(/\s+/g, "_");
  return `${category}_${title || "Scan"}_${date.toISOString().slice(0, 10)}.${extension}`;
}
export function parseAmount(value) {
  const normalized = String(value).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Enter a non-negative amount with up to two decimal places.",
    );
  const [whole, decimals = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}
export function receiptSuggestion(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const total = [...lines]
    .reverse()
    .find(
      (line) =>
        /\b(?:grand total|amount due|total)\b/i.test(line) &&
        !/subtotal|tax total/i.test(line),
    );
  const match = total?.match(/\d[\d,]*\.\d{2}/g);
  return {
    merchant: lines[0]?.slice(0, 80) || "",
    amount: match?.at(-1)?.replace(/,/g, "") || "",
    date: text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || "",
  };
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function receiptCsv(rows) {
  return (
    "\uFEFF" +
    [
      ["Merchant", "Date", "Currency", "Amount", "Document"],
      ...rows.map((row) => [
        row.merchant,
        row.date,
        row.currency,
        (row.cents / 100).toFixed(2),
        row.name,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function changedLines(first, second) {
  // Count-aware line comparison: bounded memory, preserves duplicate-line additions/removals.
  const a = first
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const b = second
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const subtract = (source, other) => {
    const counts = new Map();
    for (const line of other) counts.set(line, (counts.get(line) || 0) + 1);
    return source.filter((line) => {
      const count = counts.get(line) || 0;
      if (count) {
        counts.set(line, count - 1);
        return false;
      }
      return true;
    });
  };
  return { removed: subtract(a, b), added: subtract(b, a) };
}
export function validCorners(points) {
  if (
    points.length !== 8 ||
    points.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
  )
    return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = i * 2,
      b = ((i + 1) % 4) * 2,
      c = ((i + 2) % 4) * 2;
    const cross =
      (points[b] - points[a]) * (points[c + 1] - points[b + 1]) -
      (points[b + 1] - points[a + 1]) * (points[c] - points[b]);
    if (Math.abs(cross) < 0.005) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return sign > 0;
}
