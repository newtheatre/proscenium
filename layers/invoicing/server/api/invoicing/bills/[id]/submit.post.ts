// Sends a draft bill to the approvers (IE-19): refused without the supplier's file or with a duplicate number (I-11).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBill, submitBill } from '../../../../bills'

export default defineRoute({ ability: 'invoicing.bill.log', rateLimit: 'write', input: z.object({ version: z.number().int().min(0) }).strict() }, async (event, { input, unit }) => {
  const bill = await requireBill(getRouterParam(event, 'id'))
  await submitBill(unit, bill, input.version)
  return { billId: bill.id }
})
