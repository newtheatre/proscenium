// Making and keeping an issued invoice's PDF (rule I-16): built from the frozen row and its lines,
// stored as a core file in the invoice's slot, and its id kept on the invoice. Safe to repeat: an
// invoice that has its PDF is left alone.
import { first, nowMs, useSetting, wordsFrom, type UnitView } from '#kit'
import { storeFile } from '#modules/core'
import { linesOf, requireInvoice, type Invoice, type Line } from './invoices'
import { formatDay, formatMoney } from './money'
import { renderInvoicePdf, type PdfInvoice } from './pdf'
import catalogue from '../i18n/en-GB/documents.json'

const say = wordsFrom(catalogue)
const MILLI = 1000 // not-policy: quantities are held in thousandths
const PERCENT = 100 // not-policy: basis points to a percentage

const text = async (key: Parameters<typeof useSetting>[0]) => ((await useSetting(key)) as string | null)?.trim() || null
const rateOf = (bp: number) => `${bp / PERCENT}%`

/** The document's content, from the frozen row only. */
export async function documentOf(invoice: Invoice, lines: Line[]): Promise<PdfInvoice> {
  const vat = invoice.sellerTaxNumber !== null
  const money = (minor: number) => formatMoney(minor, invoice.currency)
  const totals: PdfInvoice['totals'] = []
  if (vat) {
    totals.push({ label: say('invoicing.pdf.net-total'), value: await money(invoice.netMinor) })
    const byRate = new Map<number, number>()
    for (const l of lines) byRate.set(l.taxRateBp, (byRate.get(l.taxRateBp) ?? 0) + l.taxMinor)
    for (const [bp, tax] of [...byRate].sort((a, b) => b[0] - a[0])) totals.push({ label: say('invoicing.pdf.vat-at', { rate: rateOf(bp) }), value: await money(tax) })
    totals.push({ label: say('invoicing.pdf.vat-total'), value: await money(invoice.taxMinor) })
  }
  totals.push({ label: say('invoicing.pdf.total'), value: await money(invoice.totalMinor), strong: true })
  return {
    number: invoice.number!,
    vat,
    issueOn: await formatDay(invoice.issueOn!),
    dueOn: await formatDay(invoice.dueOn!),
    suppliedOn: invoice.suppliedOn && invoice.suppliedOn !== invoice.issueOn ? await formatDay(invoice.suppliedOn) : null,
    reference: invoice.reference,
    seller: {
      name: await text('core.organisation.legal-name') ?? await text('core.site.name') ?? '',
      address: await text('core.organisation.address') ?? '',
      taxNumber: invoice.sellerTaxNumber,
      charityNumber: await text('core.organisation.charity-number'),
      companyNumber: await text('core.organisation.company-number'),
    },
    party: { name: invoice.billToName, address: invoice.billToAddress, taxNumber: invoice.taxNumber },
    lines: await Promise.all(lines.map(async l => ({
      description: l.description,
      quantity: String(l.quantityMilli / MILLI),
      price: await money(l.unitMinor),
      rate: vat ? rateOf(l.taxRateBp) : null,
      tax: vat ? await money(l.taxMinor) : null,
      net: await money(l.netMinor),
    }))),
    totals,
    bankDetails: await text('invoicing.pay.bank-details'),
    notes: invoice.notes,
  }
}

/** Makes the PDF of an issued invoice that has none yet, and keeps it on the invoice. */
export async function makePdf(unit: UnitView, invoiceId: string): Promise<string | null> {
  const invoice = await requireInvoice(invoiceId)
  if (invoice.state === 'draft' || invoice.state === 'submitted') return null
  const kept = await first<{ pdfFileId: string | null }>('SELECT pdf_file_id AS pdfFileId FROM invoicing_invoices WHERE id = ?', invoice.id)
  if (kept?.pdfFileId) return kept.pdfFileId
  const bytes = await renderInvoicePdf(await documentOf(invoice, await linesOf(invoice.id)))
  const fileId = await storeFile(unit, { slot: 'invoicing.invoice-pdf', ownerType: 'invoicing.invoice', ownerId: invoice.id, bytes, mediaType: 'application/pdf', title: invoice.number! })
  unit.add({ sql: 'UPDATE invoicing_invoices SET pdf_file_id = ?, updated_at = ? WHERE id = ? AND pdf_file_id IS NULL', params: [fileId, nowMs(), invoice.id] }).expect(1, { code: 'invoicing.pdf.made', reason: 'This invoice\'s PDF was made a moment ago.' })
  return fileId
}
