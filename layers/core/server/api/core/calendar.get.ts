// The programme calendar (C-13): performances and closures from one operating day to another, for a
// venue, a space or everything, with the venues and spaces the calendar can be narrowed to.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { calendarBetween } from '../../programme/calendar'
import { listVenues } from '../../places/service'

const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const MOST_DAYS = 42 // not-policy: six weeks, the most a month view shows
const DAY = 86_400_000 // not-policy: milliseconds in a day

export default defineRoute({
  ability: 'core.production.view',
  rateLimit: 'default',
  input: z.object({
    from: z.string().regex(DATE),
    to: z.string().regex(DATE),
    venueId: z.string().min(1).optional(),
    spaceId: z.string().min(1).optional(),
  }),
}, async (_event, { input }) => {
  const span = (Date.parse(input.to) - Date.parse(input.from)) / DAY + 1
  if (!(span >= 1 && span <= MOST_DAYS)) refuse('core.calendar.window', `Choose between 1 and ${MOST_DAYS} days.`, { status: 422, fields: { to: `Choose between 1 and ${MOST_DAYS} days.` } })
  const [window, venues] = await Promise.all([
    calendarBetween(input.from, input.to, { venueId: input.venueId, spaceId: input.spaceId }),
    listVenues(),
  ])
  return {
    ...window,
    places: venues.map(v => ({ id: v.id, name: v.name, spaces: v.spaces.filter(s => !s.archived).map(s => ({ id: s.id, name: s.name })) })),
  }
})
