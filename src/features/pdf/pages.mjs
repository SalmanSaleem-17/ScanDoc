// Page selection is pure so it can be tested without a device or native engine.
// Page numbers are 1-based everywhere the user sees them; callers convert to
// 0-based indexes only when calling the native renderer.
export function parsePageRanges(input, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1)
    throw new Error("This document has no pages to select.");
  const text = String(input ?? "").trim();
  if (!text) throw new Error("Enter pages to include, for example 1-5, 8.");
  const pages = new Set();
  for (const part of text.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const match = /^(\d{1,6})(?:\s*[-–]\s*(\d{1,6}))?$/.exec(piece);
    if (!match)
      throw new Error(`"${piece}" is not a page or range. Use 1-5, 8.`);
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1) throw new Error("Page numbers start at 1.");
    if (start > end) throw new Error(`"${piece}" ends before it starts.`);
    if (end > pageCount)
      throw new Error(
        `This document has ${pageCount} ${pageCount === 1 ? "page" : "pages"}.`,
      );
    for (let page = start; page <= end; page++) pages.add(page);
  }
  if (!pages.size) throw new Error("Enter pages to include, for example 1-5, 8.");
  return [...pages].sort((a, b) => a - b);
}
// Collapses consecutive pages so the user can confirm a selection at a glance.
export function formatPages(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts = [];
  for (let index = 0; index < sorted.length; ) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    parts.push(
      index === end
        ? `${sorted[index]}`
        : `${sorted[index]}–${sorted[end]}`,
    );
    index = end + 1;
  }
  return parts.join(", ");
}
// Returns the exact output files a split will produce, so the screen can show
// them before any processing starts.
export function splitPlan(pageCount, mode, value) {
  if (!Number.isInteger(pageCount) || pageCount < 1)
    throw new Error("This document has no pages to split.");
  if (mode === "extract") {
    const pages = parsePageRanges(value, pageCount);
    return [{ suffix: formatPages(pages).replace(/[,\s]+/g, "_"), pages }];
  }
  if (mode === "every") {
    const size = Number(String(value).trim());
    if (!Number.isInteger(size) || size < 1)
      throw new Error("Enter a whole number of pages per file, at least 1.");
    if (size >= pageCount)
      throw new Error(
        `Enter fewer than ${pageCount} pages per file, or this produces a copy of the original.`,
      );
    const plan = [];
    for (let start = 1; start <= pageCount; start += size) {
      const end = Math.min(start + size - 1, pageCount);
      const pages = [];
      for (let page = start; page <= end; page++) pages.push(page);
      plan.push({ suffix: start === end ? `${start}` : `${start}-${end}`, pages });
    }
    return plan;
  }
  if (mode === "single")
    return Array.from({ length: pageCount }, (_, index) => ({
      suffix: `${index + 1}`,
      pages: [index + 1],
    }));
  throw new Error("Choose how to split this document.");
}
