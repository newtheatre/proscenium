// The passes (BO-64), with what one can cover: the productions Box office sells and the seasons,
// and who a price can be kept to, from the requirements on offer.
import { all, defineRoute, requirements, usePoint } from '#kit'
import { getProduction, listSeasons } from '#modules/core'
import { listPassTypes } from '../../../passes'

export default defineRoute({
  ability: 'box-office.pass.manage',
  rateLimit: 'default',
}, async () => {
  const rows = await listPassTypes()
  const sold = (await all<{ production_id: string }>('SELECT DISTINCT production_id FROM box_office_bands')).map(b => b.production_id)
  const ids = [...new Set([...sold, ...rows.flatMap(r => r.productionIds)])]
  const productions = (await Promise.all(ids.map(async (id) => {
    const production = await getProduction(id).catch(() => null)
    return production && { id: production.id, title: production.title, seasonId: production.seasonId, state: production.state }
  }))).filter(p => p !== null).sort((a, b) => a.title.localeCompare(b.title))
  const seasons = (await listSeasons()).map(s => ({ id: s.id, name: s.name, state: s.state }))
  const sources = (await usePoint('core.requirement')).map(c => c.id)
  const offered = (await Promise.all(sources.map(id => requirements.options(id, '')))).flat()
  const labels: Record<string, string> = Object.fromEntries(offered.map(o => [o.reference, o.label]))
  const inUse = [...new Set(rows.flatMap(r => r.prices.flatMap(p => p.requirementRefs)))]
  for (const [ref, d] of Object.entries(await requirements.describe(inUse))) labels[ref] = d.label
  return { rows, productions, seasons, requirementOptions: offered.map(o => ({ value: o.reference, label: o.label })), requirementLabels: labels }
})
