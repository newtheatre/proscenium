// A space or a venue was archived: its bookables are archived too, and bookings ahead cancelled
// with reason bookable-removed, requests declined (rule L4).
import { all, defineListener } from '#kit'
import { displace } from '../displace'
import { followArchived } from '../setup'

export default defineListener(async (event, unit) => {
  const where = event.name === 'core.space.archived' ? { spaceId: event.payload.spaceId as string } : { venueId: event.payload.venueId as string }
  const ids = 'spaceId' in where
    ? await all<{ id: string }>('SELECT id FROM spaces_bookables WHERE space_id = ? AND state != \'archived\'', where.spaceId)
    : await all<{ id: string }>('SELECT id FROM spaces_bookables WHERE state != \'archived\' AND space_id IN (SELECT id FROM core_spaces WHERE venue_id = ?)', where.venueId)
  if (!ids.length) return
  followArchived(unit, where)
  unit.announce('spaces.bookable.archived', ids.map(r => ({ payload: { bookableId: r.id }, record: ['spaces.bookable', r.id] as const })))
  const d = { reason: 'bookable-removed' as const, ...where }
  if ((await displace(unit, d)).more) unit.enqueue('spaces.clear-window', d)
})
