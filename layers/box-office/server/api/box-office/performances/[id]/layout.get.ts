// A performance's wheelchair spaces: the layouts its space has, its own choice if it has one, what
// its run (or its space's usual layout) would give it, and how they stand: how many are booked, the
// seats each takes, and the seats kept back until when.
import { getRouterParam } from 'nuxt/server'
import { all, defineRoute, nowMs } from '#kit'
import { getPerformance } from '#modules/core'
import { arrangementFor, displacementsFor, listLayouts, type Arrangement } from '../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const performance = await getPerformance(record!.id)
  const [layouts, now, inherited] = await Promise.all([listLayouts(performance.spaceId), arrangementFor(performance.id), arrangementFor(performance.id, { ignoreOwn: true })])
  const own = now.from === 'performance' ? now.arrangement : null
  const describe = (a: Arrangement | null) => a && { layoutId: a.layout?.id ?? null, name: a.layout?.name ?? null, wheelchairSpaces: a.spaces, seatsPerSpace: a.seatsEach, seatsBandId: a.layout ? null : a.seatsBandId ?? null }
  const pools = await all<{ id: string, bandId: string, kind: string, name: string, capacity: number, claimed: number }>(
    'SELECT o.id, o.band_id AS bandId, b.kind, b.name, o.capacity, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? ORDER BY b.sort, b.name', performance.id)
  const [plan] = await displacementsFor(pools.map(p => p.id))
  const wheelchair = plan ? pools.find(p => p.id === plan.wheelchairPoolId) : undefined
  const seats = plan?.seatPoolId ? pools.find(p => p.id === plan.seatPoolId) : undefined
  const unsold = wheelchair ? Math.max(0, wheelchair.capacity - wheelchair.claimed) : 0
  return {
    spaceId: performance.spaceId,
    layouts,
    // The production's seating sections, any of which a space's seats may come from.
    sections: pools.filter(p => p.kind === 'standard').map(p => ({ id: p.bandId, name: p.name })),
    layoutId: now.arrangement?.layout?.id ?? null,
    // The performance's own choice, overriding its run's; null when it takes its run's.
    own: describe(own),
    // What it takes without one: its run's choice, or its space's usual layout.
    inherited: inherited.arrangement ? { ...describe(inherited.arrangement)!, from: inherited.from } : null,
    wheelchair: wheelchair
      ? {
          spaces: wheelchair.capacity,
          booked: wheelchair.claimed,
          seatsEach: plan!.units,
          section: seats?.name ?? null,
          // Seats kept back now for the spaces not yet booked, and until when.
          kept: plan!.keepUntil !== null && nowMs() < plan!.keepUntil ? Math.min(unsold * plan!.units, Math.max(0, (seats?.capacity ?? 0) - (seats?.claimed ?? 0))) : 0,
          keepUntil: plan!.keepUntil,
          // Let go early by staff: when, and until when they would have been kept (for Undo).
          releasedAt: plan!.releasedAt,
          wouldKeepUntil: plan!.wouldKeepUntil,
        }
      : null,
  }
})
