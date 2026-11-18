// A performance's seating layout: the layouts its space has, the one it uses, and how its wheelchair
// spaces stand: how many are booked, the seats each takes, and the seats kept back until when.
import { getRouterParam } from 'h3'
import { all, defineRoute, nowMs } from '#kit'
import { getPerformance } from '#modules/core'
import { displacementsFor, layoutOf, listLayouts } from '../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const performance = await getPerformance(record!.id)
  const [layouts, { layout, chosen }] = await Promise.all([listLayouts(performance.spaceId), layoutOf(performance.id)])
  const pools = await all<{ id: string, kind: string, name: string, capacity: number, claimed: number }>(
    'SELECT o.id, b.kind, b.name, o.capacity, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ?', performance.id)
  const [plan] = await displacementsFor(pools.map(p => p.id))
  const wheelchair = plan ? pools.find(p => p.id === plan.wheelchairPoolId) : undefined
  const seats = plan?.seatPoolId ? pools.find(p => p.id === plan.seatPoolId) : undefined
  const unsold = wheelchair ? Math.max(0, wheelchair.capacity - wheelchair.claimed) : 0
  return {
    spaceId: performance.spaceId,
    layouts,
    layoutId: layout?.id ?? null,
    // Whether someone chose it for this performance, or it is the space's usual one.
    chosen,
    wheelchair: wheelchair
      ? {
          spaces: wheelchair.capacity,
          booked: wheelchair.claimed,
          seatsEach: plan!.units,
          section: seats?.name ?? null,
          // Seats kept back now for the spaces not yet booked, and until when.
          kept: plan!.keepUntil !== null && nowMs() < plan!.keepUntil ? Math.min(unsold * plan!.units, Math.max(0, (seats?.capacity ?? 0) - (seats?.claimed ?? 0))) : 0,
          keepUntil: plan!.keepUntil,
        }
      : null,
  }
})
