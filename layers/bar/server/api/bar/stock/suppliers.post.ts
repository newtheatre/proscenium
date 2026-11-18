// Adds a bar supplier from the delivery form, so someone receiving stock can name one that is not on
// the list yet without a trip to Admin. It is a term of the bar.supplier vocabulary like any other.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { addTerm } from '#modules/core'
import { SUPPLIERS } from '../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  rateLimit: 'write',
  input: z.object({ label: z.string().trim().min(1).max(80) }).strict(), // not-policy: a term label's bounds
}, async (_event, { input, unit }) => ({ supplierTermId: await addTerm(unit, SUPPLIERS, { label: input.label }) }))
