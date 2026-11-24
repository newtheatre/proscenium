// What the public invoice page shows (S12, rule I-18): the frozen invoice the link opens, its lines,
// what is still owed and the theatre's bank details. Paid or credited, it says nothing is owed and
// keeps the PDF until the link expires.
import { first, linkTokens, nowMs, useSetting } from '#kit'
import { COLUMNS, linesOf, type Invoice } from './invoices'

async function byLink(token: string): Promise<Invoice | null> {
  if (!token) return null
  return first<Invoice>(
    `SELECT ${COLUMNS} FROM invoicing_invoices i WHERE i.pay_token_hash = ? AND i.pay_token_expires_at > ? AND i.direction = 'out' AND i.state IN ('open', 'closed')`,
    await linkTokens.hash(token), nowMs())
}

export async function publicInvoice(token: string) {
  const invoice = await byLink(token)
  if (!invoice) return null
  const pdf = await first<{ id: string | null }>('SELECT pdf_file_id AS id FROM invoicing_invoices WHERE id = ?', invoice.id)
  return {
    theatre: (await useSetting('core.organisation.legal-name') as string | null) ?? (await useSetting('core.site.name') as string | null) ?? '',
    number: invoice.number,
    vat: invoice.sellerTaxNumber !== null,
    sellerTaxNumber: invoice.sellerTaxNumber,
    billToName: invoice.billToName,
    reference: invoice.reference,
    issueOn: invoice.issueOn,
    dueOn: invoice.dueOn,
    currency: invoice.currency,
    netMinor: invoice.netMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    owedMinor: invoice.state === 'open' ? invoice.totalMinor - invoice.allocatedMinor : 0,
    lines: (await linesOf(invoice.id)).map(l => ({ description: l.description, quantityMilli: l.quantityMilli, unitMinor: l.unitMinor, netMinor: l.netMinor, taxMinor: l.taxMinor, taxRateBp: l.taxRateBp })),
    bankDetails: await useSetting('invoicing.pay.bank-details') as string | null,
    notes: invoice.notes,
    pdfReady: !!pdf?.id,
  }
}

export async function publicPdf(token: string): Promise<{ objectKey: string, name: string } | null> {
  const invoice = await byLink(token)
  if (!invoice) return null
  const file = await first<{ objectKey: string }>(
    "SELECT f.object_key AS objectKey FROM invoicing_invoices i JOIN core_files f ON f.id = i.pdf_file_id WHERE i.id = ? AND f.state = 'ready'", invoice.id)
  return file ? { objectKey: file.objectKey, name: invoice.number ?? 'invoice' } : null
}
