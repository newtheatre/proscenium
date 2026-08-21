/** CSV for the exports. RFC 4180 quoting: the only rule that matters here. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
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
