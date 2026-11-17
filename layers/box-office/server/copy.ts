// Copying a performance's set-up from another (BO-02; Box office specification, part 6,
// "Performance set-up"): its bands, capacities, prices and limits; never its sold tickets or holds.
// From another production, each band is matched to this production's band of the same name and
// kind, or made. A price that differs from what this performance charges now becomes the
// production's price where the production has none for that band and ticket type, and otherwise
// this performance's own, so copying never changes what the production's other performances charge.
import { can, createUnit, refuse, type Actor, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { priceLayers, pricesFor, setPrices, type PriceInput } from './prices'
import { createBand, listBands, poolsOf, salesOf, saveSales } from './setup'

export interface Copied { bands: number, pools: number, prices: number }

/**
 * Makes the bands this production lacks, in a unit of their own and committed at once, so the copy
 * that follows can name them. Says, for each source band, the band it maps to here.
 */
export async function matchBands(targetPerformanceId: string, sourcePerformanceId: string): Promise<{ map: Map<string, string>, made: number }> {
  const target = await getPerformance(targetPerformanceId)
  const source = await getPerformance(sourcePerformanceId)
  const pools = await poolsOf(sourcePerformanceId)
  const map = new Map<string, string>()
  if (source.productionId === target.productionId) {
    for (const p of pools) map.set(p.bandId, p.bandId)
    return { map, made: 0 }
  }
  const have = await listBands(target.productionId)
  const unit = createUnit()
  let made = 0
  for (const [i, p] of pools.entries()) {
    const same = have.find(b => b.name.toLowerCase() === p.bandName.toLowerCase() && b.kind === p.bandKind)
    map.set(p.bandId, same?.id ?? createBand(unit.view(), target.productionId, { name: p.bandName, kind: p.bandKind as 'standard' | 'wheelchair' | 'restricted_view', sort: i }))
    if (!same) made++
  }
  await unit.commit()
  return { map, made }
}

/** Copies capacities, prices and limits from one performance to another, in the caller's unit. */
export async function copySetup(unit: UnitView, targetPerformanceId: string, sourcePerformanceId: string, actor: Actor, options: { confirmOverVenue?: boolean } = {}): Promise<Copied> {
  if (targetPerformanceId === sourcePerformanceId) refuse('box-office.copy.same', 'Choose another performance to copy from.', { status: 422 })
  const source = await getPerformance(sourcePerformanceId)
  if (!(await can(actor, 'box-office.performance.manage', ['core.performance', source.id])).allowed)
    refuse('box-office.copy.not-found', 'There is no such performance to copy from.', { status: 404 })
  const pools = await poolsOf(source.id)
  if (!pools.length) refuse('box-office.copy.nothing', 'That performance has not been set up for sale, so there is nothing to copy.', { status: 422 })
  const target = await getPerformance(targetPerformanceId)
  const sameProduction = source.productionId === target.productionId
  if (!sameProduction && !(await can(actor, 'box-office.pricing.manage', ['core.production', target.productionId])).allowed)
    refuse('core.forbidden', 'Copying from another production adds bands and prices, which needs the ability to manage pricing.', { status: 403 })

  const { map, made } = await matchBands(target.id, source.id)
  const sales = await salesOf(source.id)
  await saveSales(unit, target.id, {
    pools: pools.map(p => ({ bandId: map.get(p.bandId)!, capacity: p.capacity })),
    ...(sales?.maxPerOrder != null ? { maxPerOrder: sales.maxPerOrder } : {}),
    ...(sales?.holdMinutes != null ? { holdMinutes: sales.holdMinutes } : {}),
    confirmOverVenue: options.confirmOverVenue,
  }, actor)

  const layers = await priceLayers(target.productionId, target.id)
  const rows: PriceInput[] = []
  let currency = 'GBP'
  for (const price of await pricesFor(source.id)) {
    currency = price.currency
    // A Wheelchair space's price follows the others and is never set.
    if (price.derived) continue
    const bandId = map.get(price.bandId)
    if (!bandId) continue
    const layer = layers.find(l => l.bandId === bandId && l.ticketTypeId === price.ticketTypeId)
    const now = layer?.own ? layer.own.amountMinor : layer?.production ?? null
    if (now === price.amountMinor) continue
    const productionHasNone = !layer || (layer.production === null && !layer.own)
    rows.push({ bandId, ticketTypeId: price.ticketTypeId, performanceId: productionHasNone ? null : target.id, amountMinor: price.amountMinor })
  }
  if (rows.length) setPrices(unit, target.productionId, currency, rows, actor.accountId ?? null)
  unit.audit({ action: 'update', record: ['core.performance', target.id], detail: { copiedFrom: source.id, bands: made, pools: pools.length, prices: rows.length } })
  return { bands: made, pools: pools.length, prices: rows.length }
}
