// The sales report (Box office specification, part 6, "Sales report"): the productions this person
// may see reports for and, for the one chosen, counts and face value by performance, ticket type and
// channel. A grant of box-office.report.view on one production shows that production alone.
import { z } from 'zod'
import { can, defineRoute, refuse } from '#kit'
import { salesSummary, soldProductions } from '../../../reports'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ productionId: z.string().max(64).optional() }), // not-policy: shape bound
}, async (_event, { input, actor }) => {
  const productions = []
  for (const p of await soldProductions()) if ((await can(actor, 'box-office.report.view', ['core.production', p.id])).allowed) productions.push(p)
  if (!productions.length) refuse('core.access.denied', 'You cannot see any sales reports.', { status: 403 })
  const chosen = input.productionId ?? productions[0]!.id
  if (!productions.some(p => p.id === chosen)) refuse('core.access.denied', 'You cannot see sales for this production.', { status: 403 })
  return {
    productions,
    report: await salesSummary(chosen),
    canExport: (await can(actor, 'box-office.report.export', ['core.production', chosen])).allowed,
  }
})
