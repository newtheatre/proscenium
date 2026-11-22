// A performance's sales set-up, with the checklist that names anything missing before it can go on
// sale, the performance itself, and every band of its production.
import { getRouterParam } from 'h3'
import { defineRoute, useSetting } from '#kit'
import { getPerformance, getProduction } from '#modules/core'
import { houseOf } from '../../../../../layouts'
import { priceLayers, scheduledPrices } from '../../../../../prices'
import { runSeatsOf } from '../../../../../run-setup'
import { checklist, laidOut, listBands, salesOf } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const [sales, list, houseCapacity, performance] = await Promise.all([salesOf(record!.id), checklist(record!.id), houseOf(record!.id), getPerformance(record!.id)])
  const production = await getProduction(performance.productionId)
  // With a seating layout the wheelchair spaces are the layout's, shown and chosen on their own (layout.get.ts).
  const run = await runSeatsOf(production.id)
  const [cap, hold, release] = await Promise.all([useSetting('box-office.orders.seat-cap'), useSetting('box-office.baskets.hold-for'), useSetting('box-office.reservations.release-before')]) as [number, number, number | null]
  const minutes = (seconds: number) => Math.round(seconds / 60) // not-policy: seconds to minutes
  const shown = <T extends { kind?: string, bandKind?: string }>(rows: T[]) => laidOut(sales) ? rows.filter(r => (r.kind ?? r.bandKind) !== 'wheelchair') : rows
  return {
    sales,
    houseCapacity,
    pools: shown(list.pools),
    prices: list.prices,
    // Where each price comes from: every performance of the production, or this one's own.
    priceLayers: await priceLayers(production.id, performance.id),
    // Changes set to take effect later, for the production and this performance.
    scheduledPrices: await scheduledPrices(production.id, performance.id),
    checklist: list.items,
    // For the set-up screen: what the performance is, and every band its production has.
    performance: { id: performance.id, productionId: production.id, productionState: production.state, title: production.title, label: performance.label, startsAt: performance.startsAt, state: performance.state },
    bands: shown(await listBands(production.id)),
    // What the run sells in each section, and whether this night's seats differ from it.
    run: { seats: run.seats, ownSeats: run.own.has(performance.id) },
    // The theatre's settings, which a limit left empty takes, in the units they are typed in here.
    defaults: { maxPerOrder: cap, holdMinutes: minutes(hold), releaseMinutes: release === null ? null : minutes(release) },
  }
})
