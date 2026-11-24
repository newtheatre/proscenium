// Keeps an uploaded and checked file as the bill's copy of the supplier's invoice (I-11).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { attachBillFile, requireBill } from '../../../../bills'

export default defineRoute({ ability: 'invoicing.bill.log', rateLimit: 'write', input: z.object({ fileId: z.string().min(1) }).strict() }, async (event, { input, unit }) => {
  const bill = await requireBill(getRouterParam(event, 'id'))
  await attachBillFile(unit, bill, input.fileId)
  return { billId: bill.id }
})
