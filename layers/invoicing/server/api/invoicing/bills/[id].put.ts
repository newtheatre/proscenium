// Rewrites a draft bill whole; once submitted only an approver's send-back reopens it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { billFields } from '../../../../shared/invoices'
import { requireBill, updateBill } from '../../../bills'

export default defineRoute({ ability: 'invoicing.bill.log', rateLimit: 'write', input: billFields.extend({ version: z.number().int().min(0) }) }, async (event, { input, unit }) => {
  const bill = await requireBill(getRouterParam(event, 'id'))
  await updateBill(unit, bill, input)
  return { billId: bill.id }
})
