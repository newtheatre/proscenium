// A production's tickets at a glance, for its Tickets tab and the fact in its summary strip (show
// walkthrough, decision 1): each performance still to come or played, with where its sales stand
// and how many seats are taken, and whether the production is published, since a production still
// in draft can be on sale while its public pages are not there yet.
import { getRouterParam } from 'h3'
import { all, defineRoute } from '#kit'
import { getProduction, listPerformances } from '#modules/core'
import { priceLayers } from '../../../../../prices'
import { runSeats } from '../../../../../run-setup'
import { listBands } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const production = await getProduction(record!.id!)
  const performances = (await listPerformances({ productionId: production.id })).filter(p => p.state !== 'cancelled')
  const ids = JSON.stringify(performances.map(p => p.id))
  const sales = new Map((await all<{ performance_id: string, state: string }>('SELECT performance_id, state FROM box_office_performance_sales WHERE performance_id IN (SELECT value FROM json_each(?))', ids)).map(s => [s.performance_id, s.state]))
  const pools = await all<{ performance_id: string, band_id: string, capacity: number, claimed: number }>(
    'SELECT performance_id, band_id, capacity, claimed FROM box_office_pools WHERE performance_id IN (SELECT value FROM json_each(?))', ids)
  const run = runSeats(performances.filter(p => p.state === 'scheduled' || p.state === 'draft').map(p => ({ id: p.id, pools: pools.filter(o => o.performance_id === p.id) })))
  const seats = new Map((await all<{ performance_id: string, capacity: number, claimed: number }>(
    'SELECT performance_id, sum(capacity) AS capacity, sum(claimed) AS claimed FROM box_office_pools WHERE performance_id IN (SELECT value FROM json_each(?)) GROUP BY performance_id', ids)).map(s => [s.performance_id, s]))
  const rows = performances.map(p => ({
    id: p.id,
    label: p.label,
    startsAt: p.startsAt,
    scheduled: p.state === 'scheduled',
    past: p.state === 'completed',
    sales: (sales.get(p.id) ?? null) as 'draft' | 'on_sale' | 'paused' | 'closed' | null,
    capacity: seats.get(p.id)?.capacity ?? 0,
    taken: seats.get(p.id)?.claimed ?? 0,
    pools: pools.filter(o => o.performance_id === p.id).map(o => ({ bandId: o.band_id, capacity: o.capacity, claimed: o.claimed })),
    // Seats of its own, set for this night alone, rather than the run's.
    ownSeats: run.own.has(p.id),
  }))
  return {
    production: { id: production.id, title: production.title, state: production.state },
    // The production's sections, and the seats most of the run sells in each.
    sections: await listBands(production.id),
    runSeats: run.seats,
    // The production's own prices, which every performance charges unless it has its own.
    runPrices: (await priceLayers(production.id, '')).filter(l => l.production !== null).map(l => ({ bandId: l.bandId, ticketTypeId: l.ticketTypeId, amountMinor: l.production! })),
    performances: rows,
    totals: {
      performances: rows.length,
      onSale: rows.filter(r => r.sales === 'on_sale').length,
      taken: rows.reduce((sum, r) => sum + r.taken, 0),
      capacity: rows.reduce((sum, r) => sum + r.capacity, 0),
    },
  }
})
