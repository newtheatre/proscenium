// The kit desk's scan (S6): a loan number, a label or a tag opens the loan it belongs to, for someone
// who works the desk for that loan's department.
import { defineRoute, requireAbility } from '#kit'
import { z } from 'zod'
import { scanLoan } from '../../../desk-reading'
import { loanOf } from '../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ code: z.string().trim().min(1).max(300) }), // not-policy: a label's address with room to spare
}, async (_event, { input, actor }) => {
  const loan = await loanOf(await scanLoan(input.code))
  await requireAbility(actor, 'inventory.loan.issue', ['inventory.department', loan.departmentId])
  return { loanId: loan.id }
})
