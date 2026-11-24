// The PDF of an invoice out (S14, rules I-16 and I-41): A4, from the frozen row only, so making it
// twice gives the same content. A VAT invoice carries every field I-41 lists; unregistered, none.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { wordsFrom } from '#kit'
import catalogue from '../i18n/en-GB/documents.json'

const say = wordsFrom(catalogue)

export interface PdfLine { description: string, quantity: string, price: string, rate: string | null, tax: string | null, net: string }
export interface PdfInvoice {
  number: string
  vat: boolean
  issueOn: string
  dueOn: string
  suppliedOn: string | null
  reference: string
  seller: { name: string, address: string, taxNumber: string | null, charityNumber: string | null, companyNumber: string | null }
  party: { name: string, address: string, taxNumber: string }
  lines: PdfLine[]
  totals: { label: string, value: string, strong?: boolean }[]
  bankDetails: string | null
  notes: string
}

const PAGE = { width: 595.28, height: 841.89, margin: 50 } // not-policy: the page's layout
const SIZE = { body: 10, small: 8, heading: 20, name: 14 } // not-policy: the page's layout
const LEADING = 1.35 // not-policy: line spacing
const MUTED = rgb(0.35, 0.35, 0.35) // not-policy: grey for labels

interface Pen { page: PDFPage, y: number }

/** One line the standard font can draw: a letter it lacks loses its accent, or else becomes a question mark. */
function drawable(font: PDFFont, text: string): string {
  const known = new Set(font.getCharacterSet())
  const fits = (c: string) => known.has(c.codePointAt(0)!)
  return [...text.replace(/[\t\r\n]/g, ' ')].map((c) => {
    if (fits(c)) return c
    const plain = c.normalize('NFD')[0]!
    return fits(plain) ? plain : '?'
  }).join('')
}

/** Splits text into lines no wider than `width`, keeping its own line breaks. */
function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n').map(p => drawable(font, p))) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && font.widthOfTextAtSize(next, size) > width) {
        out.push(line)
        line = word
      }
      else line = next
    }
    out.push(line)
  }
  return out
}

interface WriteOptions { x?: number, size?: number, font?: PDFFont, colour?: ReturnType<typeof rgb>, width?: number, right?: boolean }

/** A pen on the current page, which turns to a new page when the next line would not fit. */
interface Writer {
  pen: Pen
  regular: PDFFont
  bold: PDFFont
  width: number
  ensure: (height: number) => void
  write: (text: string, options?: WriteOptions) => void
  gap: (points: number) => void
}

function writerFor(pdf: PDFDocument, regular: PDFFont, bold: PDFFont): Writer {
  const width = PAGE.width - 2 * PAGE.margin
  const pen: Pen = { page: pdf.addPage([PAGE.width, PAGE.height]), y: PAGE.height - PAGE.margin }
  const ensure = (height: number) => {
    if (pen.y - height >= PAGE.margin) return
    pen.page = pdf.addPage([PAGE.width, PAGE.height])
    pen.y = PAGE.height - PAGE.margin
  }
  const write = (text: string, options: WriteOptions = {}) => {
    const size = options.size ?? SIZE.body
    const font = options.font ?? regular
    const x = options.x ?? PAGE.margin
    for (const line of wrap(font, size, text, options.width ?? width)) {
      ensure(size * LEADING)
      pen.y -= size * LEADING
      const at = options.right ? x + (options.width ?? 0) - font.widthOfTextAtSize(line, size) : x
      pen.page.drawText(line, { x: at, y: pen.y, size, font, color: options.colour ?? rgb(0, 0, 0) })
    }
  }
  return { pen, regular, bold, width, ensure, write, gap: (points: number) => { pen.y -= points } }
}

/** The theatre on the left, the document's title and dates on the right, then who it is to. */
function drawHeading(w: Writer, doc: PdfInvoice): void {
  const half = { width: w.width / 2 }
  const top = w.pen.y
  w.write(doc.seller.name, { ...half, font: w.bold, size: SIZE.name })
  const sellerLines: [string | null, WriteOptions][] = [
    [doc.seller.address || null, half],
    [doc.seller.taxNumber && say('invoicing.pdf.our-vat', { number: doc.seller.taxNumber }), half],
    [doc.seller.charityNumber && say('invoicing.pdf.charity', { number: doc.seller.charityNumber }), { ...half, colour: MUTED, size: SIZE.small }],
    [doc.seller.companyNumber && say('invoicing.pdf.company', { number: doc.seller.companyNumber }), { ...half, colour: MUTED, size: SIZE.small }],
  ]
  for (const [text, options] of sellerLines) if (text) w.write(text, options)
  const leftEnd = w.pen.y
  w.pen.y = top
  const right = { x: PAGE.margin + w.width / 2, width: w.width / 2, right: true }
  w.write(doc.vat ? say('invoicing.pdf.vat-invoice') : say('invoicing.pdf.invoice'), { ...right, font: w.bold, size: SIZE.heading })
  w.gap(4) // not-policy: the page's layout
  const facts: [string, string | null][] = [
    [say('invoicing.pdf.number'), doc.number],
    [say('invoicing.pdf.date'), doc.issueOn],
    [say('invoicing.pdf.supplied'), doc.suppliedOn],
    [say('invoicing.pdf.due'), doc.dueOn],
    [say('invoicing.pdf.reference'), doc.reference || null],
  ]
  for (const [label, value] of facts) if (value) w.write(`${label}: ${value}`, right)
  w.pen.y = Math.min(w.pen.y, leftEnd) - 24 // not-policy: the page's layout

  w.write(say('invoicing.pdf.to'), { font: w.bold, colour: MUTED, size: SIZE.small })
  w.write(doc.party.name, { font: w.bold })
  if (doc.party.address) w.write(doc.party.address)
  if (doc.vat && doc.party.taxNumber) w.write(say('invoicing.pdf.their-vat', { number: doc.party.taxNumber }))
  w.gap(20) // not-policy: the page's layout
}

/** The totals, right-aligned under the lines. */
function drawTotals(w: Writer, doc: PdfInvoice): void {
  for (const total of doc.totals) {
    w.ensure(SIZE.body * LEADING)
    const font = total.strong ? w.bold : w.regular
    w.pen.y -= SIZE.body * LEADING
    const labelX = PAGE.margin + w.width * 0.55 // not-policy: the page's layout
    w.pen.page.drawText(drawable(font, total.label), { x: labelX, y: w.pen.y, size: SIZE.body, font })
    const value = drawable(font, total.value)
    w.pen.page.drawText(value, { x: PAGE.margin + w.width - font.widthOfTextAtSize(value, SIZE.body), y: w.pen.y, size: SIZE.body, font })
  }
}

/** How to pay and the notes, then "Page n of m" on every page. */
function drawFooter(w: Writer, pdf: PDFDocument, doc: PdfInvoice): void {
  if (doc.bankDetails) {
    w.write(say('invoicing.pdf.how-to-pay'), { font: w.bold })
    w.write(doc.bankDetails)
    w.write(say('invoicing.pdf.pay-reference', { number: doc.number }), { colour: MUTED })
    w.gap(12) // not-policy: the page's layout
  }
  if (doc.notes) {
    w.write(say('invoicing.pdf.notes'), { font: w.bold })
    w.write(doc.notes)
  }
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    const text = say('invoicing.pdf.page', { n: i + 1, of: pages.length })
    page.drawText(text, { x: PAGE.width - PAGE.margin - w.regular.widthOfTextAtSize(text, SIZE.small), y: PAGE.margin / 2, size: SIZE.small, font: w.regular, color: MUTED })
  })
}

export async function renderInvoicePdf(doc: PdfInvoice): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.vat ? say('invoicing.pdf.vat-invoice') : say('invoicing.pdf.invoice')} ${doc.number}`)
  pdf.setCreationDate(new Date(`${doc.issueOn}T12:00:00Z`))
  pdf.setModificationDate(new Date(`${doc.issueOn}T12:00:00Z`))
  pdf.setProducer('Proscenium')
  const w = writerFor(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold))
  drawHeading(w, doc)
  drawLines(w, doc)
  w.gap(10) // not-policy: the page's layout
  drawTotals(w, doc)
  w.gap(24) // not-policy: the page's layout
  drawFooter(w, pdf, doc)
  return pdf.save({ useObjectStreams: false })
}

/** The lines table: description, quantity, price, and rate and VAT on a VAT invoice, then the net. */
function drawLines(w: Writer, doc: PdfInvoice) {
  const { pen, width } = w
  const columns = doc.vat
    ? [{ key: 'description', share: 0.4 }, { key: 'quantity', share: 0.1 }, { key: 'price', share: 0.13 }, { key: 'rate', share: 0.1 }, { key: 'vat', share: 0.12 }, { key: 'net', share: 0.15 }] // not-policy: the page's layout
    : [{ key: 'description', share: 0.55 }, { key: 'quantity', share: 0.12 }, { key: 'price', share: 0.15 }, { key: 'amount', share: 0.18 }] // not-policy: the page's layout
  let x = PAGE.margin
  const placed = columns.map((c) => {
    const at = { ...c, x, w: width * c.share }
    x += at.w
    return at
  })
  const row = (cells: string[], font: PDFFont) => {
    const wrapped = cells.map((text, i) => wrap(font, SIZE.body, text, placed[i]!.w - 6)) // not-policy: the page's layout
    const height = Math.max(...wrapped.map(lines => lines.length)) * SIZE.body * LEADING
    w.ensure(height + 6) // not-policy: the page's layout
    wrapped.forEach((lines, i) => {
      const column = placed[i]!
      lines.forEach((line, n) => {
        const y = pen.y - (n + 1) * SIZE.body * LEADING
        const lx = i > 0 ? column.x + column.w - font.widthOfTextAtSize(line, SIZE.body) : column.x
        pen.page.drawText(line, { x: lx, y, size: SIZE.body, font })
      })
    })
    pen.y -= height + 4 // not-policy: the page's layout
  }
  const rule = () => pen.page.drawLine({ start: { x: PAGE.margin, y: pen.y + 2 }, end: { x: PAGE.margin + width, y: pen.y + 2 }, thickness: 0.5, color: MUTED }) // not-policy: the page's layout
  row(placed.map(c => say(`invoicing.pdf.${c.key}`)), w.bold)
  rule()
  for (const line of doc.lines) row(doc.vat ? [line.description, line.quantity, line.price, line.rate ?? '', line.tax ?? '', line.net] : [line.description, line.quantity, line.price, line.net], w.regular)
  rule()
}
