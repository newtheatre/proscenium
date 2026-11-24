// A space or a venue was archived: its bookables are archived too (rule L4). Bookings ahead are
// cancelled by the change-and-priority slice's set-wise listener.
import { all, defineListener } from '#kit'
import { followArchived } from '../setup'

export default defineListener(async (event, unit) => {
  const where = event.name === 'core.space.archived' ? { spaceId: event.payload.spaceId as string } : { venueId: event.payload.venueId as string }
  const ids = 'spaceId' in where
    ? await all<{ id: string }>('SELECT id FROM spaces_bookables WHERE space_id = ? AND state != \'archived\'', where.spaceId)
    : await all<{ id: string }>('SELECT id FROM spaces_bookables WHERE state != \'archived\' AND space_id IN (SELECT id FROM core_spaces WHERE venue_id = ?)', where.venueId)
  if (!ids.length) return
  followArchived(unit, where)
  unit.announce('spaces.bookable.archived', ids.map(r => ({ payload: { bookableId: r.id }, record: ['spaces.bookable', r.id] as const })))
})
