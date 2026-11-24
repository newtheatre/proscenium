// My availability (S1): my patterns with their lines, my entries, each day's levels over the dates
// asked for, and the requests asking me. A person sees everything of their own, labels and reasons too.
import { getQuery } from 'h3'
import { sql } from 'drizzle-orm'
import { defineRoute, inAccountScope, refuse, theatreTimeZone, useDb, useSetting } from '#kit'
import type { Unmarked } from '../../../shared/levels'
import { daysQuery } from '../../inputs'
import { nextDate, resolveDay } from '../../levels'
import { rowsOf } from '../../reading'
import { myRequests } from '../../requests'
import { entryDates } from '../../entries'
import { commitmentsOf } from '../../commitments'

const DAYS_MAX = 62 // not-policy: rule F2's widest window

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const parsed = daysQuery.safeParse(getQuery(event))
  if (!parsed.success || parsed.data.to < parsed.data.from) refuse('availability.window', 'Say which days to show.', { status: 422 })
  const { from, to } = parsed.data
  const dates = [from]
  while (dates.length <= DAYS_MAX && dates.at(-1)! < to) dates.push(nextDate(dates.at(-1)!))
  if (dates.length > DAYS_MAX) refuse('availability.window', `At most ${DAYS_MAX} days at once.`, { status: 422 })
  const me = actor.accountId!
  const db = useDb()
  const rows = (await rowsOf([me], from, to)).get(me)!
  const unmarked = rows.unmarked ?? await useSetting('availability.entry.unmarked-default') as Unmarked
  const patterns = await db.all<{ id: string, label: string, starts_on: string, ends_on: string | null }>(sql`SELECT id, label, starts_on, ends_on FROM availability_patterns WHERE ${inAccountScope('account_id', me)} ORDER BY starts_on`)
  const lines = await db.all<{ pattern_id: string, weekday: number, from_local: string, until_local: string, level: string }>(sql`SELECT l.pattern_id, l.weekday, l.from_local, l.until_local, l.level
    FROM availability_pattern_lines l JOIN availability_patterns p ON p.id = l.pattern_id WHERE ${inAccountScope('p.account_id', me)} ORDER BY l.weekday, l.from_local`)
  const { today, horizon } = await entryDates()
  const exceptions = await db.all<Record<string, unknown>>(sql`SELECT id, first_date, last_date, weekdays, from_local, until_local, level, reason, reason_shared, entered_by, request_id
    FROM availability_exceptions WHERE ${inAccountScope('account_id', me)} AND last_date >= ${today} ORDER BY first_date, from_local, id`)
  return {
    today,
    horizon,
    grid: {
      step: Number(await useSetting('availability.grid.step')),
      dayStarts: await useSetting('availability.grid.day-starts') as string,
      dayEnds: await useSetting('availability.grid.day-ends') as string,
    },
    profile: { unmarkedMeans: rows.unmarked, unmarked, changedAt: rows.changedAt, checkedTo: rows.checkedTo },
    patterns: patterns.map(p => ({ id: p.id, label: p.label, startsOn: p.starts_on, endsOn: p.ends_on, lines: lines.filter(l => l.pattern_id === p.id).map(l => ({ weekday: l.weekday, from: l.from_local, until: l.until_local, level: l.level })) })),
    exceptions: exceptions.map(e => ({ id: e.id, firstDate: e.first_date, lastDate: e.last_date, weekdays: e.weekdays ? JSON.parse(e.weekdays as string) : null, from: e.from_local, until: e.until_local, level: e.level, reason: e.reason, reasonShared: !!e.reason_shared, onBehalf: e.entered_by !== me, requestId: e.request_id })),
    days: dates.map(date => ({ date, pieces: resolveDay(date, rows, { unmarked, showReason: () => true, own: true }) })),
    commitments: (await commitmentsOf([me], dates, await theatreTimeZone()))[me] ?? {},
    requests: await myRequests(me),
  }
})
