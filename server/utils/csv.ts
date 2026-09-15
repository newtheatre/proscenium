// RFC 4180: every field quoted, inner quotes doubled, so a comma or a newline cannot end a row
// early. A leading =, +, - or @ is prefixed, because a spreadsheet reads one as a formula (D-129).

// A finite figure is exempt: a negative on-hand or variance is a number in the reader's
// spreadsheet, and the guard is for what a person typed (F-119 criterion 3).
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const looksLikeAFormula = /^[=+\-@]/.test(text) && !Number.isFinite(Number(text))
  const guarded = looksLikeAFormula ? `'${text}` : text
  return `"${guarded.replaceAll('"', '""')}"`
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0]!)
  const lines = [columns.map(csvField).join(',')]
  for (const row of rows) lines.push(columns.map(column => csvField(row[column])).join(','))
  return `${lines.join('\r\n')}\r\n`
}
