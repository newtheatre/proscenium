/** A number, so a spreadsheet keeps summing it rather than reading an apostrophe. */
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/

/** CSV for every export: neutralise the cell, then quote it for RFC 4180. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  // A cell opening = + - @ tab or CR is a formula to Excel, and staff and
  // customers type these values (the Challenge 25 notes, a booking's name).
  const safe = /^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}

/** Sets the download headers and returns the body. */
export function sendCsv(event: Parameters<typeof setHeader>[0], filename: string, body: string): string {
  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${filename}"`)
  return body
}

/** Pounds for a spreadsheet: pence are the store, not the export format. */
export function penceToPounds(pence: number | null | undefined): string {
  return pence === null || pence === undefined ? '' : (pence / 100).toFixed(2)
}
