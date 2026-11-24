// Approves a submitted bill and posts it once (IE-20); never by whoever logged it (I-10).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { approveBill, requireBill } from '../../../../bills'

export default defineRoute({
  ability: 'invoicing.bill.approve',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ version: z.number().int().min(0), expectedTotalMinor: z.number().int().min(0) }).strict(),
}, async (_event, { record, input, unit, actor }) => {
  const bill = await requireBill(record!.id)
  await approveBill(unit, actor, bill, input)
  return { billId: bill.id }
})
