/**
 * A minimal PDF writer: enough for a paginated text table, no dependency. The
 * Workers runtime has no PDF library, exactly as with `qr.ts` and `ics.ts`.
 */

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 40
const LINE_HEIGHT = 14

export interface PdfColumn { header: string, width: number }

/** WinAnsi only: the base fonts have no glyph for anything wider. */
function pdfText(value: string): string {
  return value
    .replace(/[‘’]/g, '\'')
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1')
}

/** Crude but honest: Helvetica at 9pt averages a little over half its size. */
function truncate(value: string, width: number, size: number): string {
  const max = Math.max(1, Math.floor(width / (size * 0.5)))
  return value.length > max ? `${value.slice(0, Math.max(1, max - 3))}...` : value
}

function contentStream(title: string, subtitle: string, columns: PdfColumn[], rows: string[][], page: number, pages: number): string {
  const parts: string[] = []
  let y = PAGE_HEIGHT - MARGIN

  parts.push(`BT /F2 16 Tf ${MARGIN} ${y} Td (${pdfText(title)}) Tj ET`)
  y -= 18
  parts.push(`BT /F1 9 Tf ${MARGIN} ${y} Td (${pdfText(subtitle)}) Tj ET`)
  y -= 20

  let x = MARGIN
  for (const column of columns) {
    parts.push(`BT /F2 9 Tf ${x} ${y} Td (${pdfText(truncate(column.header, column.width, 9))}) Tj ET`)
    x += column.width
  }
  y -= 4
  parts.push(`${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S`)
  y -= LINE_HEIGHT

  for (const row of rows) {
    x = MARGIN
    for (const [i, cell] of row.entries()) {
      const column = columns[i]
      if (!column) continue
      parts.push(`BT /F1 9 Tf ${x} ${y} Td (${pdfText(truncate(cell, column.width, 9))}) Tj ET`)
      x += column.width
    }
    y -= LINE_HEIGHT
  }

  parts.push(`BT /F1 8 Tf ${MARGIN} ${MARGIN - 12} Td (${pdfText(`Page ${page} of ${pages}`)}) Tj ET`)
  return parts.join('\n')
}

/** Rows per page, leaving room for the heading block and the footer. */
export function rowsPerPage(): number {
  return Math.floor((PAGE_HEIGHT - MARGIN * 2 - 60) / LINE_HEIGHT)
}

export function tablePdf(title: string, subtitle: string, columns: PdfColumn[], rows: string[][]): Uint8Array {
  const perPage = rowsPerPage()
  const chunks: string[][][] = []
  for (let i = 0; i < Math.max(1, rows.length); i += perPage) chunks.push(rows.slice(i, i + perPage))

  const objects: string[] = []
  const pageIds = chunks.map((_, i) => 5 + i * 2)

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${chunks.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

  chunks.forEach((chunk, index) => {
    const pageId = pageIds[index]!
    const streamId = pageId + 1
    const body = contentStream(title, subtitle, columns, chunk, index + 1, chunks.length)
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`
    objects[streamId] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    const object = objects[id]
    if (!object) continue
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${object}\nendobj\n`
  }

  const xrefStart = pdf.length
  const count = objects.length
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let id = 1; id < count; id++) {
    pdf += offsets[id] === undefined
      ? '0000000000 65535 f \n'
      : `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  // Latin1: every byte written above is already in that range.
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF
  return bytes
}

/** Europe/London: a licensing register is read in local time or not at all. */
export function formatRegisterStamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
