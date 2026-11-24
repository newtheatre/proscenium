// My weekly patterns (S2) with their lines, and the grid step to edit them on. Only the person's own.
import { sql } from 'drizzle-orm'
import { defineRoute, inAccountScope, useDb, useSetting } from '#kit'
import { entryDates } from '../../../entries'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const me = actor.accountId!
  const db = useDb()
  const patterns = await db.all<{ id: string, label: string, starts_on: string, ends_on: string | null }>(sql`SELECT id, label, starts_on, ends_on FROM availability_patterns WHERE ${inAccountScope('account_id', me)} ORDER BY starts_on DESC`)
  const lines = await db.all<{ pattern_id: string, weekday: number, from_local: string, until_local: string, level: string }>(sql`SELECT l.pattern_id, l.weekday, l.from_local, l.until_local, l.level
    FROM availability_pattern_lines l JOIN availability_patterns p ON p.id = l.pattern_id WHERE ${inAccountScope('p.account_id', me)} ORDER BY l.weekday, l.from_local`)
  const { today, horizon } = await entryDates()
  return {
    today,
    horizon,
    grid: { step: Number(await useSetting('availability.grid.step')), dayStarts: await useSetting('availability.grid.day-starts') as string },
    patterns: patterns.map(p => ({ id: p.id, label: p.label, startsOn: p.starts_on, endsOn: p.ends_on, lines: lines.filter(l => l.pattern_id === p.id).map(l => ({ weekday: l.weekday, from: l.from_local, until: l.until_local, level: l.level })) })),
  }
})
