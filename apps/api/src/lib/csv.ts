/**
 * RFC 4180 CSV encoding with spreadsheet formula-injection protection (OWASP "CSV Injection"):
 * cells starting with = + - @ TAB or CR are prefixed with a single quote so Excel/Sheets
 * treat them as text instead of executing them.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Plain numbers (e.g. "-25.00") are safe and must stay numeric for spreadsheets.
  if (FORMULA_TRIGGER.test(text) && !NUMERIC.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsvRow(cells: Array<string | number | null | undefined>): string {
  return `${cells.map(escapeCsvCell).join(',')}\r\n`;
}

/** Produces a filename safe for a Content-Disposition header. */
export function safeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop diacritics: "Café" → "Cafe"
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'export';
}
