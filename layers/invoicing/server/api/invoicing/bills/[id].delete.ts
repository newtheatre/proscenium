// Deletes a draft bill; an approved one is undone only by a supplier's credit note.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteBill, requireBill } from '../../../bills'

export default defineRoute({ ability: 'invoicing.bill.log', rateLimit: 'write', input: z.object({ version: z.number().int().min(0) }).strict() }, async (event, { input, unit }) => {
  deleteBill(unit, await requireBill(getRouterParam(event, 'id')), input.version)
  return { deleted: true }
})
