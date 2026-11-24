// Items that could match a wanted line (INV-18): the loan's department's, each free or not over its window.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { z } from 'zod'
import { requireGather } from '../../../../loan-access'
import { loanOf } from '../../../../lending'
import { candidatesFor } from '../../../../pull-lists'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(1).max(120) }), // not-policy: a sane search length
}, async (event, { input, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await requireGather(actor, loan)
  return { items: await candidatesFor(loan, input.q) }
})
