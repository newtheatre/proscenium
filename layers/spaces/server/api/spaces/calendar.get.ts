// The calendar (SP-14, rules K1 to K3): the bookables this person may see, and what is on from one
// operating day to another, at most 31 days, for the ones asked for. Each bookable is checked on
// its own. Every item carries the operating day it is drawn on.
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { dayBounds, operatingDayOf } from '#modules/core'
import { calendarFor } from '../../reading'

const DAY = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const query = z.object({ from: z.string().regex(DAY), to: z.string().regex(DAY), bookables: z.string().max(2000).optional() }) // not-policy: shape bound

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const parsed = query.safeParse(getQuery(event))
  if (!parsed.success) refuse('spaces.calendar.window', 'Say which days to show.', { status: 422 })
  const { from, to, bookables } = parsed.data
  const window = { from: (await dayBounds(from)).start, to: (await dayBounds(to)).end }
  const shown = await calendarFor(actor, { ...window, bookableIds: bookables ? bookables.split(',').filter(Boolean) : [] })
  const items = await Promise.all(shown.items.map(async item => ({ ...item, day: await operatingDayOf(item.startsAt), lastDay: await operatingDayOf(Math.max(item.startsAt, item.endsAt - 1)) })))
  return { bookables: shown.bookables.map(b => ({ id: b.id, name: b.name, kind: b.kind, venueName: b.venueName, colour: b.colour, external: b.control === 'external', request: b.may.request, staff: b.may.staff })), items }
})
