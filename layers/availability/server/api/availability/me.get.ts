// My availability (S1): my patterns with their lines, my exceptions, my levels over the window asked
// for, and the requests asking me. A person sees everything of their own, labels and reasons too.
import { getQuery } from 'h3'
import { sql } from 'drizzle-orm'
import { defineRoute, inAccountScope, refuse, useDb } from '#kit'
import { windowQuery } from '../../inputs'
import { levels } from '../../reading'
import { myRequests } from '../../requests'
import { entryDates } from '../../entries'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const parsed = windowQuery.safeParse(getQuery(event))
  if (!parsed.success) refuse('availability.window', 'Say which days to show.', { status: 422 })
  const me = actor.accountId!
  const db = useDb()
  const [profile] = await db.all<{ unmarked_means: string | null, changed_at: number, checked_to: string | null }>(sql`SELECT unmarked_means, changed_at, checked_to FROM availability_profiles WHERE ${inAccountScope('account_id', me)} ORDER BY changed_at DESC LIMIT 1`)
  const patterns = await db.all<{ id: string, label: string, starts_on: string, ends_on: string | null }>(sql`SELECT id, label, starts_on, ends_on FROM availability_patterns WHERE ${inAccountScope('account_id', me)} ORDER BY starts_on`)
  const lines = await db.all<{ pattern_id: string, weekday: number, from_local: string, until_local: string, level: string }>(sql`SELECT l.pattern_id, l.weekday, l.from_local, l.until_local, l.level
    FROM availability_pattern_lines l JOIN availability_patterns p ON p.id = l.pattern_id WHERE ${inAccountScope('p.account_id', me)} ORDER BY l.weekday, l.from_local`)
  const { today, horizon } = await entryDates()
  const exceptions = await db.all<Record<string, unknown>>(sql`SELECT id, first_date, last_date, weekdays, from_local, until_local, level, reason, reason_shared, entered_by, request_id
    FROM availability_exceptions WHERE ${inAccountScope('account_id', me)} AND last_date >= ${today} ORDER BY first_date, id`)
  return {
    today,
    horizon,
    profile: { unmarkedMeans: profile?.unmarked_means ?? null, changedAt: profile?.changed_at ?? null, checkedTo: profile?.checked_to ?? null },
    patterns: patterns.map(p => ({ id: p.id, label: p.label, startsOn: p.starts_on, endsOn: p.ends_on, lines: lines.filter(l => l.pattern_id === p.id).map(l => ({ weekday: l.weekday, from: l.from_local, until: l.until_local, level: l.level })) })),
    exceptions: exceptions.map(e => ({ id: e.id, firstDate: e.first_date, lastDate: e.last_date, weekdays: e.weekdays ? JSON.parse(e.weekdays as string) : null, from: e.from_local, until: e.until_local, level: e.level, reason: e.reason, reasonShared: !!e.reason_shared, onBehalf: e.entered_by !== me, requestId: e.request_id })),
    blocks: (await levels({ accountIds: [me] }, parsed.data.from, parsed.data.to, actor)).blocks.map(({ accountId: _, ...b }) => b),
    requests: await myRequests(me),
  }
})
