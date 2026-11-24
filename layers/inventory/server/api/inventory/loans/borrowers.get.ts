// Finds a member to lend to (INV-21) or who is collecting at the desk (K5), for those who may lend or
// work the desk for some department: the person picker's answer, a name and enough to tell two people apart, never contact details.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { searchAccounts } from '#modules/core'
import { departmentsFor } from '../../../reading'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input, actor }) => {
  if (!(await departmentsFor(actor, 'inventory.loan.approve')).length && !(await departmentsFor(actor, 'inventory.loan.issue')).length) refuse('core.access.denied', 'You do not have permission to do this.', { status: 403 })
  return { people: await searchAccounts(input.q) }
})
