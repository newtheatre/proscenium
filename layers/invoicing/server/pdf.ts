// The PDF of an invoice out (S14, rules I-16 and I-41): A4, from the frozen row only, so making it
// twice gives the same content. A VAT invoice carries every field I-41 lists; unregistered, none.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { wordsFrom } from '#kit'
import catalogue from '../i18n/en-GB/documents.json'

const say = wordsFrom(catalogue)

export interface PdfLine { description: string, quantity: string, price: string, rate: string | null, tax: string | null, net: string }
export interface PdfInvoice {
  /** Invoice, VAT invoice or credit note. */
  title: string
  number: string
  /** The invoice a credit note is against. */
  against: string | null
  vat: boolean
  issueOn: string
  dueOn: string | null
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

export async function renderInvoicePdf(doc: PdfInvoice): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.title} ${doc.number}`)
  pdf.setCreationDate(new Date(`${doc.issueOn}T12:00:00Z`))
  pdf.setModificationDate(new Date(`${doc.issueOn}T12:00:00Z`))
  pdf.setProducer('Proscenium')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const width = PAGE.width - 2 * PAGE.margin
  const pen: Pen = { page: pdf.addPage([PAGE.width, PAGE.height]), y: PAGE.height - PAGE.margin }

  const ensure = (height: number) => {
    if (pen.y - height >= PAGE.margin) return
    pen.page = pdf.addPage([PAGE.width, PAGE.height])
    pen.y = PAGE.height - PAGE.margin
  }
  const write = (text: string, options: { x?: number, size?: number, font?: PDFFont, colour?: ReturnType<typeof rgb>, width?: number, right?: boolean } = {}) => {
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
  const gap = (points: number) => { pen.y -= points }

  // The theatre on the left, the document's title and dates on the right.
  const top = pen.y
  write(doc.seller.name, { font: bold, size: SIZE.name, width: width / 2 })
  if (doc.seller.address) write(doc.seller.address, { width: width / 2 })
  if (doc.seller.taxNumber) write(say('invoicing.pdf.our-vat', { number: doc.seller.taxNumber }), { width: width / 2 })
  if (doc.seller.charityNumber) write(say('invoicing.pdf.charity', { number: doc.seller.charityNumber }), { width: width / 2, colour: MUTED, size: SIZE.small })
  if (doc.seller.companyNumber) write(say('invoicing.pdf.company', { number: doc.seller.companyNumber }), { width: width / 2, colour: MUTED, size: SIZE.small })
  const leftEnd = pen.y
  pen.y = top
  const right = { x: PAGE.margin + width / 2, width: width / 2, right: true }
  write(doc.title, { ...right, font: bold, size: SIZE.heading })
  gap(4) // not-policy: the page's layout
  const facts: [string, string][] = [
    [say('invoicing.pdf.number'), doc.number],
    [say('invoicing.pdf.date'), doc.issueOn],
    ...(doc.suppliedOn ? [[say('invoicing.pdf.supplied'), doc.suppliedOn] as [string, string]] : []),
    ...(doc.against ? [[say('invoicing.pdf.against'), doc.against] as [string, string]] : []),
    ...(doc.dueOn ? [[say('invoicing.pdf.due'), doc.dueOn] as [string, string]] : []),
    ...(doc.reference ? [[say('invoicing.pdf.reference'), doc.reference] as [string, string]] : []),
  ]
  for (const [label, value] of facts) write(`${label}: ${value}`, right)
  pen.y = Math.min(pen.y, leftEnd) - 24 // not-policy: the page's layout

  write(say('invoicing.pdf.to'), { font: bold, colour: MUTED, size: SIZE.small })
  write(doc.party.name, { font: bold })
  if (doc.party.address) write(doc.party.address)
  if (doc.vat && doc.party.taxNumber) write(say('invoicing.pdf.their-vat', { number: doc.party.taxNumber }))
  gap(20) // not-policy: the page's layout

  drawLines(doc, { regular, bold }, pen, ensure, width)
  gap(10) // not-policy: the page's layout
  for (const total of doc.totals) {
    ensure(SIZE.body * LEADING)
    const font = total.strong ? bold : regular
    pen.y -= SIZE.body * LEADING
    const labelX = PAGE.margin + width * 0.55 // not-policy: the page's layout
    pen.page.drawText(drawable(font, total.label), { x: labelX, y: pen.y, size: SIZE.body, font })
    const value = drawable(font, total.value)
    pen.page.drawText(value, { x: PAGE.margin + width - font.widthOfTextAtSize(value, SIZE.body), y: pen.y, size: SIZE.body, font })
  }
  gap(24) // not-policy: the page's layout
  if (doc.bankDetails) {
    write(say('invoicing.pdf.how-to-pay'), { font: bold })
    write(doc.bankDetails)
    write(say('invoicing.pdf.pay-reference', { number: doc.number }), { colour: MUTED })
    gap(12) // not-policy: the page's layout
  }
  if (doc.notes) {
    write(say('invoicing.pdf.notes'), { font: bold })
    write(doc.notes)
  }
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    const text = say('invoicing.pdf.page', { n: i + 1, of: pages.length })
    page.drawText(text, { x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(text, SIZE.small), y: PAGE.margin / 2, size: SIZE.small, font: regular, color: MUTED })
  })
  return pdf.save({ useObjectStreams: false })
}

/** The lines table: description, quantity, price, and rate and VAT on a VAT invoice, then the net. */
function drawLines(doc: PdfInvoice, fonts: { regular: PDFFont, bold: PDFFont }, pen: Pen, ensure: (h: number) => void, width: number) {
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
    const height = Math.max(...wrapped.map(w => w.length)) * SIZE.body * LEADING
    ensure(height + 6) // not-policy: the page's layout
    wrapped.forEach((lines, i) => {
      const column = placed[i]!
      lines.forEach((line, n) => {
        const y = pen.y - (n + 1) * SIZE.body * LEADING
        const right = i > 0
        const lx = right ? column.x + column.w - font.widthOfTextAtSize(line, SIZE.body) : column.x
        pen.page.drawText(line, { x: lx, y, size: SIZE.body, font })
      })
    })
    pen.y -= height + 4 // not-policy: the page's layout
  }
  row(placed.map(c => say(`invoicing.pdf.${c.key}`)), fonts.bold)
  pen.page.drawLine({ start: { x: PAGE.margin, y: pen.y + 2 }, end: { x: PAGE.margin + width, y: pen.y + 2 }, thickness: 0.5, color: MUTED }) // not-policy: the page's layout
  for (const line of doc.lines) row(doc.vat ? [line.description, line.quantity, line.price, line.rate ?? '', line.tax ?? '', line.net] : [line.description, line.quantity, line.price, line.net], fonts.regular)
  pen.page.drawLine({ start: { x: PAGE.margin, y: pen.y + 2 }, end: { x: PAGE.margin + width, y: pen.y + 2 }, thickness: 0.5, color: MUTED }) // not-policy: the page's layout
}
