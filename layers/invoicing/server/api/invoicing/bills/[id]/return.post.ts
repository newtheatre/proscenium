// Sends a submitted bill back to whoever logged it, with the reason they read (IE-20).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBill, returnBill } from '../../../../bills'

export default defineRoute({
  ability: 'invoicing.bill.approve',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ version: z.number().int().min(0), note: z.string().trim().min(1).max(500) }).strict(), // not-policy: the column's bound
}, async (_event, { record, input, unit, actor }) => {
  const bill = await requireBill(record!.id)
  await returnBill(unit, actor, bill, input)
  return { billId: bill.id }
})
