import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'

// A formatted table PDF, hand-laid-out rather than styled from HTML: `pdf-lib` is pure JS with
// no native bindings, which is what runs on Workers (E-119 criterion 1).

export interface PdfColumn { header: string, width: number, key: string }
export interface PdfTableDocument {
  title: string
  subtitleLines: string[]
  columns: PdfColumn[]
  rows: Record<string, string>[]
}

// A4 landscape: a table with several columns needs the width more than the height.
const PAGE_SIZE: [number, number] = [841.89, 595.28]
const MARGIN = 40
const ROW_HEIGHT = 16
const FONT_SIZE = 9
const TITLE_SIZE = 14

function truncate(font: PDFFont, text: string, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, FONT_SIZE) <= maxWidth) return text
  let cut = text
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}…`, FONT_SIZE) > maxWidth) cut = cut.slice(0, -1)
  return `${cut}…`
}

export async function buildTablePdf(doc: PdfTableDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page: PDFPage = pdf.addPage(PAGE_SIZE)
  let y = PAGE_SIZE[1] - MARGIN

  function header(): void {
    page.drawText(doc.title, { x: MARGIN, y, size: TITLE_SIZE, font: bold })
    y -= TITLE_SIZE + 8
    for (const line of doc.subtitleLines) {
      page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font })
      y -= ROW_HEIGHT
    }
    y -= 6
    let x = MARGIN
    for (const column of doc.columns) {
      page.drawText(column.header, { x, y, size: FONT_SIZE, font: bold })
      x += column.width
    }
    y -= ROW_HEIGHT
  }

  header()

  for (const row of doc.rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdf.addPage(PAGE_SIZE)
      y = PAGE_SIZE[1] - MARGIN
      header()
    }
    let x = MARGIN
    for (const column of doc.columns) {
      page.drawText(truncate(font, row[column.key] ?? '', column.width - 4), { x, y, size: FONT_SIZE, font })
      x += column.width
    }
    y -= ROW_HEIGHT
  }

  return pdf.save()
}
