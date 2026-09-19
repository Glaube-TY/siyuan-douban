export function normalizeISBN(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s\-_\u2010-\u2015\u2212]/g, "")
    .toUpperCase();
}

export function isValidISBN(value: unknown): boolean {
  const normalized = normalizeISBN(value);
  return /^(?:\d{13}|\d{9}[\dX])$/.test(normalized);
}
