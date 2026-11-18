// One production's statement (FIN-04): income, fees and refunds tagged with it, by account. Someone
// granted finance.ledger.view on the production alone, such as a visiting company, may read it.
import { getRouterParam } from 'h3'
import { defineRoute, isEnabled } from '#kit'
import { getPerformance, getProduction } from '#modules/core'
import { productionStatement } from '../../../reports'

export default defineRoute({
  ability: 'finance.ledger.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const production = await getProduction(record!.id)
  const statement = await productionStatement(production.id)
  // Each performance by its date (and label), soonest first; one that is gone keeps its id.
  const performances = []
  for (const line of statement.performances) {
    const found = await getPerformance(line.performanceId).catch(() => null)
    performances.push({ ...line, startsAt: found?.startsAt ?? null, label: found?.label ?? null })
  }
  performances.sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
  return { production: { id: production.id, title: production.title, companyName: production.companyName }, lines: statement.lines, performances, ticketReport: await isEnabled('box-office') }
})
