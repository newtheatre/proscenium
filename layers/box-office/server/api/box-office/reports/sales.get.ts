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
  // With none asked for, the one playing now: the production whose performance is nearest to this moment.
  const chosen = input.productionId ?? productions.reduce((a, b) => b.nearest < a.nearest ? b : a).id
  if (!productions.some(p => p.id === chosen)) refuse('core.access.denied', 'You cannot see sales for this production.', { status: 403 })
  return {
    productions: productions.map(p => ({ id: p.id, title: p.title, startsAt: p.startsAt })),
    report: await salesSummary(chosen),
    canExport: (await can(actor, 'box-office.report.export', ['core.production', chosen])).allowed,
  }
})
