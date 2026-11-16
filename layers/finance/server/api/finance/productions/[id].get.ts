// One production's statement (FIN-04): income, fees and refunds tagged with it, by account. Someone
// granted finance.ledger.view on the production alone, such as a visiting company, may read it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { productionStatement } from '../../../reports'

export default defineRoute({
  ability: 'finance.ledger.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const production = await getProduction(record!.id)
  return { production: { id: production.id, title: production.title, companyName: production.companyName }, ...await productionStatement(production.id) }
})
