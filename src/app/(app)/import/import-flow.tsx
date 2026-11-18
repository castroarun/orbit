"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { importCustomers, type ImportResult } from "../../actions-crm";
import { CONSENT_SOURCES } from "@/lib/consent";
import { analyzeImport, guessMapping, IMPORT_FIELDS, parseCsv, type ImportField } from "@/lib/import-check";
import { formatPhone } from "@/lib/phone";

type Sheet = { name: string; rows: unknown[][] };

const MAX_FILE_MB = 4;

function cellText(v: unknown) {
  if (v instanceof Date) return v.toLocaleDateString("en-IN");
  return String(v ?? "");
}

/** Upload → match columns and check → save. Nothing is sent to anyone from here. */
export function ImportFlow({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [consentForAll, setConsentForAll] = useState(false);
  const [source, setSource] = useState("billing");
  const [readError, setReadError] = useState("");
  const [result, setResult] = useState<ImportResult>(undefined);
  const [saving, startSaving] = useTransition();

  const sheet = sheets[sheetIdx];
  const headers = useMemo(() => (sheet?.rows[0] ?? []).map((h) => cellText(h).trim()), [sheet]);
  const body = useMemo(() => sheet?.rows.slice(1) ?? [], [sheet]);
  const hasConsentColumn = mapping.includes("consent");
  const report = useMemo(
    () => (mapping.length ? analyzeImport(body, mapping, { consentForAll: !hasConsentColumn && consentForAll }) : null),
    [body, mapping, consentForAll, hasConsentColumn],
  );

  async function onFile(file: File | undefined) {
    setReadError("");
    setResult(undefined);
    setSheets([]);
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setReadError(`That file is over ${MAX_FILE_MB} MB. Save only the columns we need (name, number, visit date) and try again.`);
      return;
    }
    setFileName(file.name);
    try {
      let read: Sheet[];
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        read = [{ name: "CSV", rows: parseCsv(await file.text()) }];
      } else if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const all = await readXlsxFile(file);
        read = all.map((s) => ({ name: s.sheet, rows: s.data as unknown[][] })).filter((s) => s.rows.length > 1);
      } else {
        setReadError("Use an Excel file (.xlsx) or a CSV. For an old .xls file, open it in Excel and “Save as” .xlsx first.");
        return;
      }
      if (!read.length) {
        setReadError("The file has no rows under the heading row.");
        return;
      }
      setSheets(read);
      setSheetIdx(0);
      setMapping(guessMapping(read[0].rows[0].map((h) => cellText(h))));
    } catch {
      setReadError("Couldn't read that file. Open it in Excel, “Save as” .xlsx (or CSV), and try again.");
    }
  }

  function pickSheet(i: number) {
    setSheetIdx(i);
    setMapping(guessMapping((sheets[i]?.rows[0] ?? []).map((h) => cellText(h))));
  }

  function setField(col: number, field: ImportField) {
    setMapping((m) => m.map((f, i) => (i === col ? field : f === field && field !== "skip" ? "skip" : f)));
  }

  function save() {
    if (!report) return;
    const rows = [...report.ready, ...report.saveOnly];
    startSaving(async () => {
      setResult(await importCustomers({ businessId, rows, consentSource: hasConsentColumn ? "billing" : source, fileName }));
    });
  }

  if (result && !result.error) {
    return (
      <div className="card max-w-2xl space-y-3">
        <h2 className="h2">Saved for {businessName}</h2>
        <ul className="space-y-1 text-[13.5px]">
          <li>{result.added} new customers added</li>
          <li>{result.updated} existing customers filled in (nothing overwritten)</li>
          <li>{result.visits} visits recorded</li>
          <li>{result.consented} have agreed to WhatsApp messages</li>
        </ul>
        <p className="hint">Nothing was sent. Review requests start once the message sequence is switched on for this business.</p>
        <div className="flex gap-2 pt-1">
          <Link href={`/customers?b=${businessId}`} className="btn">
            See customers
          </Link>
          <button className="btn-ghost" onClick={() => { setResult(undefined); setSheets([]); setFileName(""); }}>
            Import another file
          </button>
        </div>
      </div>
    );
  }

  const step = sheets.length ? 2 : 1;
  const firstRow = body.find((r) => r.some((c) => String(c ?? "").trim() !== "")) ?? [];
  const toSave = report ? report.ready.length + report.saveOnly.length : 0;

  return (
    <div className="max-w-[920px]">
      <ol className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        {["Upload file", "Match columns and check", "Save"].map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "cur" : "todo";
          return (
            <li key={label} className={`flex items-center gap-2 ${state === "cur" ? "font-medium text-ink" : "text-muted"}`} aria-current={state === "cur" ? "step" : undefined}>
              <span
                className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-xs ${
                  state === "done" ? "border-[#cfe6d3] bg-[#eef6ef] text-[#166534]" : state === "cur" ? "border-ink bg-ink text-white" : "border-[#dad7d0] bg-white"
                }`}
              >
                {state === "done" ? "✓" : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <div className="card mb-5 flex flex-wrap items-center gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          {fileName && sheets.length ? (
            <>
              <div className="font-medium">{fileName}</div>
              <div className="hint">
                {sheets.length > 1 ? (
                  <label>
                    Sheet{" "}
                    <select value={sheetIdx} onChange={(e) => pickSheet(+e.target.value)} className="rounded border border-line px-1">
                      {sheets.map((s, i) => (
                        <option key={s.name + i} value={i}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <>Sheet “{sheet.name}”</>
                )}{" "}
                · {body.length} rows under the heading row
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">Choose the owner&apos;s customer list</div>
              <div className="hint">Excel (.xlsx) or CSV, first row = column headings. Needs at least a phone number column.</div>
            </>
          )}
        </div>
        <label className="btn-ghost">
          {sheets.length ? "Replace file" : "Choose file"}
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      {readError ? (
        <div role="alert" className="mb-5 rounded-lg border border-[#f2d0d0] bg-[#fbeeee] px-4 py-3 text-sm text-[#9f1d1d]">
          {readError}
        </div>
      ) : null}

      {sheet && report ? (
        <>
          <section className="mb-6">
            <h2 className="h2">Match the owner&apos;s columns</h2>
            <p className="hint">Matched automatically from the headings. Change any that are wrong.</p>
            <div className="card mt-2.5 overflow-x-auto p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Column in the file</th>
                    <th aria-hidden />
                    <th>Our field</th>
                    <th>First row</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td>{h || <span className="hint">(no heading)</span>}</td>
                      <td className="text-[#9aa0aa]" aria-hidden>
                        →
                      </td>
                      <td>
                        <label>
                          <span className="sr-only">Field for {h}</span>
                          <select value={mapping[i] ?? "skip"} onChange={(e) => setField(i, e.target.value as ImportField)} className="input h-8 min-w-[180px] py-0">
                            {Object.entries(IMPORT_FIELDS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      <td className="max-w-[260px] truncate">{cellText(firstRow[i]) || <span className="hint">empty</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!mapping.includes("phone") ? (
              <p role="alert" className="mt-2 text-sm text-[#9f1d1d]">
                Pick which column has the WhatsApp number.
              </p>
            ) : null}
          </section>

          {mapping.includes("phone") ? (
            <>
              <section className="mb-6">
                <h2 className="h2">Consent</h2>
                {hasConsentColumn ? (
                  <p className="hint mt-1">Taken from the consent column: “Yes” rows can be messaged, “No” or empty rows are saved only.</p>
                ) : (
                  <div className="card mt-2.5 space-y-2 px-4 py-3.5">
                    <label className="flex items-start gap-2.5 text-sm">
                      <input type="checkbox" checked={consentForAll} onChange={(e) => setConsentForAll(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
                      <span>
                        The owner confirms everyone in this list agreed to get WhatsApp messages from {businessName}
                        <span className="hint block">Leave unticked if not sure: customers are saved but never messaged.</span>
                      </span>
                    </label>
                    {consentForAll ? (
                      <label className="flex items-center gap-2 pl-6 text-sm">
                        <span className="hint">How they agreed:</span>
                        <select value={source} onChange={(e) => setSource(e.target.value)} className="input w-auto py-1">
                          {Object.entries(CONSENT_SOURCES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                )}
              </section>

              <section className="mb-6">
                <h2 className="h2">What we found</h2>
                <div className="card mt-2.5 grid grid-cols-2 p-0 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    [report.ready.length, "Can be messaged", true],
                    [report.saveOnly.length, "No consent, saved only", false],
                    [report.fixedNumbers, "Numbers fixed (+91 added)", false],
                    [report.duplicates, "Duplicates merged", false],
                    [report.invalid.length, "Invalid numbers, skipped", false],
                  ].map(([n, label, good]) => (
                    <div key={label as string} className="border-b border-line-soft px-4 py-3.5 lg:border-r lg:border-b-0 lg:last:border-r-0">
                      <div className={`text-[22px] font-semibold tracking-[-0.02em] ${good ? "text-[#166534]" : ""}`}>{n as number}</div>
                      <div className="hint">{label as string}</div>
                    </div>
                  ))}
                </div>
                {report.futureDates ? <p className="hint mt-2">{report.futureDates} visit dates were in the future and were left out.</p> : null}
                {report.invalid.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px] text-link">See the {report.invalid.length} skipped numbers</summary>
                    <ul className="hint mt-2 space-y-0.5">
                      {report.invalid.slice(0, 50).map((r) => (
                        <li key={r.row}>
                          Row {r.row}: “{r.value || "empty"}” ({r.reason})
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {report.ready.length ? (
                  <p className="hint mt-2">
                    Example: {report.ready[0].name ?? "No name"}, {formatPhone(report.ready[0].phone)}
                    {report.ready[0].visitDate ? `, visited ${report.ready[0].visitDate}` : ""}
                  </p>
                ) : null}
              </section>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <p className="hint">Nothing is sent now. Review requests start once the message sequence is switched on.</p>
                <button className="btn" onClick={save} disabled={saving || !toSave} aria-busy={saving}>
                  {saving ? "Saving…" : `Save ${toSave} customers`}
                </button>
              </div>
              {result?.error ? (
                <div role="alert" className="mt-3 rounded-lg border border-[#f2d0d0] bg-[#fbeeee] px-4 py-3 text-sm text-[#9f1d1d]">
                  {result.error}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
