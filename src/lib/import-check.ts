/**
 * Customer import: matching an owner's spreadsheet columns to our fields and
 * checking every row before anything is saved. Pure functions (no database),
 * used by the Import screen in the browser and by the server action.
 */
import { normalizePhone } from "./phone";

export const IMPORT_FIELDS = {
  skip: "Don't import",
  name: "Customer name",
  phone: "WhatsApp number",
  visit_date: "Visit date",
  language: "Message language",
  consent: "Agreed to WhatsApp",
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;

/** Header words that suggest each field (lower case, checked as "contains"). */
const HINTS: [ImportField, RegExp][] = [
  ["consent", /(consent|agree|opt.?in|wa ok|whatsapp ok|permission|allow)/],
  ["phone", /(mobile|phone|whatsapp|contact|cell|number|ph\b|mob\b)/],
  ["visit_date", /(date|visit|visited|last seen|appointment|bill)/],
  ["language", /(lang|மொழி)/],
  ["name", /(name|customer|patient|client|guest|பெயர்)/],
];

/** Best guess for one header. Each field is used at most once (first match wins). */
export function guessMapping(headers: string[]): ImportField[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const text = String(h ?? "").toLowerCase().trim();
    for (const [field, re] of HINTS) {
      if (!used.has(field) && re.test(text)) {
        used.add(field);
        return field;
      }
    }
    return "skip";
  });
}

/** "Tamil", "TA", "தமிழ்" → "ta"; "English", "EN" → "en"; anything else → null (business default). */
export function parseLanguage(value: unknown): "ta" | "en" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("ta") || v.includes("தமிழ்")) return "ta";
  if (v.startsWith("en")) return "en";
  return null;
}

/** Yes/No-style consent cell → true, false, or null when the cell is empty or unclear. */
export function parseConsent(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (["yes", "y", "true", "1", "ok", "agreed", "ஆம்"].includes(v)) return true;
  if (["no", "n", "false", "0", "not ok", "இல்லை"].includes(v)) return false;
  return null;
}

/**
 * Dates as Indian spreadsheets write them: 29-10-2026, 29/10/26, 2026-10-29,
 * real Excel dates (Date objects), or Excel serial numbers. Day comes first.
 * Returns "YYYY-MM-DD" or null.
 */
export function parseVisitDate(value: unknown): string | null {
  const iso = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };
  if (value instanceof Date && !isNaN(value.getTime())) {
    return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial: days since 1899-12-30
    const dt = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  const v = String(value ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[2], +m[1]);
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = v.toLowerCase().match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-,]+(\d{2,4})/);
  if (m && months.includes(m[2])) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, months.indexOf(m[2]) + 1, +m[1]);
  }
  return null;
}

export type CleanRow = {
  row: number;                // 1-based row number in the file (header = row 1)
  name: string | null;
  phone: string;              // digits, e.g. 919840012345
  language: "ta" | "en" | null;
  visitDate: string | null;   // YYYY-MM-DD
  consent: boolean;
};

export type ImportReport = {
  ready: CleanRow[];          // consent given: can be messaged once sending is switched on
  saveOnly: CleanRow[];       // no consent: saved, never messaged
  fixedNumbers: number;       // numbers we had to tidy (+91 added, spaces removed…)
  duplicates: number;         // same number more than once in the file (merged)
  invalid: { row: number; value: string; reason: string }[];
  futureDates: number;        // visit dates after today, ignored
};

/**
 * Check every row. `consentForAll` is the owner's word that everyone in the
 * file agreed (e.g. a consent line at billing); a "No" in a consent column
 * still wins over it.
 */
export function analyzeImport(
  rows: unknown[][],
  mapping: ImportField[],
  opts: { consentForAll: boolean; today?: string } = { consentForAll: false },
): ImportReport {
  const col = (f: ImportField) => mapping.indexOf(f);
  const [iName, iPhone, iDate, iLang, iConsent] = (["name", "phone", "visit_date", "language", "consent"] as const).map(col);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const byPhone = new Map<string, CleanRow>();
  const report: ImportReport = { ready: [], saveOnly: [], fixedNumbers: 0, duplicates: 0, invalid: [], futureDates: 0 };
  if (iPhone < 0) return report;

  rows.forEach((cells, idx) => {
    const rowNo = idx + 2;
    const rawPhone = String(cells[iPhone] ?? "").trim();
    if (!rawPhone && cells.every((c) => String(c ?? "").trim() === "")) return; // blank line
    const phone = normalizePhone(rawPhone);
    if (!phone.ok) {
      report.invalid.push({ row: rowNo, value: rawPhone, reason: phone.reason });
      return;
    }
    // "Fixed" = we changed the number itself (added 91, dropped a leading 0), not just spacing.
    if (rawPhone.replace(/\D/g, "").replace(/^00/, "") !== phone.phone) report.fixedNumbers++;

    let visitDate = iDate >= 0 ? parseVisitDate(cells[iDate]) : null;
    if (visitDate && visitDate > today) {
      report.futureDates++;
      visitDate = null;
    }
    const consentCell = iConsent >= 0 ? parseConsent(cells[iConsent]) : null;
    const consent = consentCell === false ? false : consentCell === true || opts.consentForAll;
    const name = iName >= 0 ? String(cells[iName] ?? "").trim() || null : null;
    const language = iLang >= 0 ? parseLanguage(cells[iLang]) : null;

    const existing = byPhone.get(phone.phone);
    if (existing) {
      report.duplicates++;
      // Merge: keep the latest visit, fill gaps, and a "No" anywhere means no.
      existing.name ??= name;
      existing.language ??= language;
      if (visitDate && (!existing.visitDate || visitDate > existing.visitDate)) existing.visitDate = visitDate;
      existing.consent = existing.consent && consent;
      return;
    }
    byPhone.set(phone.phone, { row: rowNo, name, phone: phone.phone, language, visitDate, consent });
  });

  for (const r of byPhone.values()) (r.consent ? report.ready : report.saveOnly).push(r);
  return report;
}

/**
 * Minimal CSV reader: commas or semicolons, quoted cells with "" escapes,
 * CRLF or LF. Good enough for exports from Excel, Google Sheets and billing tools.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
