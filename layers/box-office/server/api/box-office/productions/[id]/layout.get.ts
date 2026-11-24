// A run's wheelchair spaces, for its Tickets tab (Matt 2026-11-17, 21:58): the layouts of the spaces
// its performances are in, the run's choice (a layout or numbers, or none: each space's usual), and
// how many performances to come have a choice of their own.
import { getRouterParam } from 'nuxt/server'
import { all, defineRoute } from '#kit'
import { getProduction, listPerformances, placeName } from '#modules/core'
import { listLayouts, runChoice } from '../../../../layouts'
import { listBands } from '../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const production = await getProduction(record!.id!)
  const performances = (await listPerformances({ productionId: production.id })).filter(p => p.state === 'draft' || p.state === 'scheduled')
  const spaceIds = [...new Set(performances.map(p => p.spaceId).filter((id): id is string => !!id))]
  const layouts = (await Promise.all(spaceIds.map(id => listLayouts(id)))).flat()
  const names = new Map(await Promise.all(spaceIds.map(async id => [id, await placeName(id)] as const)))
  const own = await all<{ n: number }>('SELECT count(*) AS n FROM box_office_performance_sales WHERE layout_own = 1 AND performance_id IN (SELECT value FROM json_each(?))', JSON.stringify(performances.map(p => p.id)))
  return {
    layouts: layouts.map(l => ({ ...l, spaceName: names.get(l.spaceId) ?? null })),
    choice: await runChoice(production.id),
    // The production's seating sections, any of which a space's seats may come from.
    sections: (await listBands(production.id)).filter(b => b.kind === 'standard').map(b => ({ id: b.id, name: b.name })),
    ownCount: own[0]?.n ?? 0,
  }
})
