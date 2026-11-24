// S4: one bill with its lines, the supplier's file and what the viewer may do with it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { fileUrl } from '#modules/core'
import { linesOf } from '../../../invoices'
import { billChoices, billPowers, requireBill } from '../../../bills'

export default defineRoute({
  ability: 'invoicing.bill.view',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const bill = await requireBill(record!.id)
  const powers = await billPowers(actor, bill)
  return {
    bill,
    lines: await linesOf(bill.id),
    fileUrl: bill.pdfFileId ? await fileUrl(bill.pdfFileId) : null,
    choices: powers.canEdit || powers.canApprove ? await billChoices() : null,
    ...powers,
  }
})
