import { PDFDocument } from 'pdf-lib'
import { describe, expect, test } from 'bun:test'
import { buildTablePdf } from '#server/utils/pdf'

// E-119's PDF builder. Pure JS on `pdf-lib`, no native bindings, so it runs on Workers
// (criterion 1). Parsed back with `pdf-lib` itself, since its streams are compressed and a raw
// text search of the bytes would not see a single row.

describe('a table PDF (criterion 1)', () => {
  test('produces a well-formed, single-page PDF that pdf-lib can read back', async () => {
    const bytes = await buildTablePdf({
      title: 'Test register',
      subtitleLines: ['Venue: The Theatre', 'Period: 1 to 2 January 2026', 'Generated: now'],
      columns: [{ header: 'When', key: 'when', width: 100 }, { header: 'Outcome', key: 'outcome', width: 100 }],
      rows: [{ when: '1 Jan, 19:00', outcome: 'ID accepted' }],
    })

    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)

    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
  })

  test('paginates rather than overflows when there are many rows', async () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({ when: `Row ${index}`, outcome: 'ID accepted' }))
    const bytes = await buildTablePdf({
      title: 'Test register',
      subtitleLines: ['Venue: The Theatre'],
      columns: [{ header: 'When', key: 'when', width: 100 }, { header: 'Outcome', key: 'outcome', width: 100 }],
      rows,
    })

    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBeGreaterThan(1)
  })

  test('an empty table still produces a readable document', async () => {
    const bytes = await buildTablePdf({ title: 'Empty', subtitleLines: [], columns: [], rows: [] })
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
  })
})
