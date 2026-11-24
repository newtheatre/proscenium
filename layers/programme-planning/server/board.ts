// The board's read (PP-03, rules O1 to O4 and W12): every board space's time over up to fourteen
// operating days in one call, from the occupancy service, with this plan's own placements marked
// so the screen draws them in front and everything else grey behind.
import { all, refuse } from '#kit'
import type { Actor } from '#kit'
import { instantOfLocal, previousDate } from '#kit/clock'
import { dayRule } from '#modules/core'
import { occupancy } from '#modules/occupancy'
import { BOARD_MAX_DAYS } from '../shared/board'
import type { BoardDay, BoardItem, BoardSpace } from '../shared/board'
import type { Plan } from './plans'

const BOARD_MAX_SPACES = 30 // not-policy: occupancy's own bound (O3)

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) // not-policy: a day in milliseconds

/** The spaces a show can be put in, in the theatre's own order. Planning profiles (screen 11) will narrow it. */
export function boardSpaces(): Promise<BoardSpace[]> {
  return all<BoardSpace>(`SELECT s.id, s.name, v.name AS venue, s.exclusive FROM core_spaces s JOIN core_venues v ON v.id = s.venue_id
    WHERE s.state = 'active' AND s.performable = 1 AND v.state = 'active'
    ORDER BY v.name, v.id, s.sort, s.name LIMIT ${BOARD_MAX_SPACES}`)
}

/** The fourteen-day stretch of the plan's board holding a day, counted from the board's first day, and the days either side of it. */
export function chunkAround(plan: Plan, day: string): { from: string, to: string, before: string | null, after: string | null } {
  const wanted = day < plan.boardFrom ? plan.boardFrom : day > plan.boardTo ? plan.boardTo : day
  const offset = daysBetween(plan.boardFrom, wanted)
  const from = previousDate(plan.boardFrom, -(offset - (offset % BOARD_MAX_DAYS)))
  const last = previousDate(from, -(BOARD_MAX_DAYS - 1))
  const to = last > plan.boardTo ? plan.boardTo : last
  return { from, to, before: from > plan.boardFrom ? previousDate(from) : null, after: to < plan.boardTo ? previousDate(to, -1) : null }
}

/** The board's days: each operating day with the plan's first and last hour as instants. */
export async function boardDays(plan: Plan, from: string, to: string): Promise<BoardDay[]> {
  if (to < from) refuse('programme-planning.board.window', 'The last day must be on or after the first.', { status: 422 })
  if (daysBetween(from, to) >= BOARD_MAX_DAYS) refuse('programme-planning.board.too-long', `Ask for at most ${BOARD_MAX_DAYS} days at a time.`, { status: 422 })
  const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet.', { status: 409 })
  const days: BoardDay[] = []
  for (let day = from; day <= to; day = previousDate(day, -1)) {
    const start = instantOfLocal(day, plan.dayStarts, rule.timeZone)
    const end = plan.dayEnds === '00:00' ? instantOfLocal(previousDate(day, -1), '00:00', rule.timeZone) : instantOfLocal(day, plan.dayEnds, rule.timeZone)
    days.push({ day, start, end })
  }
  return days
}

/** What occupies each board space over the days, this plan's placements marked with their entry. */
export async function boardItems(plan: Plan, spaces: BoardSpace[], days: BoardDay[], actor: Actor): Promise<{ spaceId: string, items: BoardItem[] }[]> {
  if (!spaces.length || !days.length) return spaces.map(s => ({ spaceId: s.id, items: [] }))
  const from = Math.min(...days.map(d => d.start))
  const to = Math.max(...days.map(d => d.end))
  const taken = await occupancy({ spaceIds: spaces.map(s => s.id), from, to }, actor)
  const placed = await all<{ performance_id: string, entry_id: string, title: string }>(`SELECT pl.performance_id, e.id AS entry_id, coalesce(p.title, e.title) AS title
    FROM programme_planning_placements pl JOIN programme_planning_entries e ON e.id = pl.entry_id LEFT JOIN core_productions p ON p.id = e.production_id
    WHERE e.plan_id = ?`, plan.id)
  const mine = new Map(placed.map(p => [p.performance_id, { entryId: p.entry_id, title: p.title }]))
  return taken.map(s => ({
    spaceId: s.spaceId,
    items: s.items.map(i => ({ ...i, placement: i.record.type === 'core.performance' ? mine.get(i.record.id) ?? null : null })),
  }))
}
