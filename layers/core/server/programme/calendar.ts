// The programme calendar (C-13): performances and closures over a run of operating days, for one
// venue, one space or everything. Performances are placed by their stored operating day, so a show
// at 00:30 sits with the evening before; a closure carries the first and last operating day it
// touches, so an all-day closure covers whole days in the theatre's zone.
import { all, refuse } from '#kit'
import { closuresBetween, type Closure } from '../places/closures'
import { dayBounds, dayRule, operatingDayAt } from '../calendar'
import type { PerformanceState } from './performances'

export interface CalendarPerformance {
  id: string
  productionId: string
  productionTitle: string
  label: string | null
  venueId: string
  spaceId: string
  startsAt: number
  endsAt: number
  operatingDay: string
  state: PerformanceState
}

export interface CalendarClosure extends Closure {
  firstDay: string
  lastDay: string
}

export interface CalendarWindow {
  performances: CalendarPerformance[]
  closures: CalendarClosure[]
}

interface Row {
  id: string
  production_id: string
  production_title: string
  label: string | null
  venue_id: string
  space_id: string
  starts_at: number
  ends_at: number
  operating_day: string
  state: PerformanceState
}

/** Everything on the calendar from one operating day to another, both included. */
export async function calendarBetween(fromDay: string, toDay: string, scope: { venueId?: string, spaceId?: string } = {}): Promise<CalendarWindow> {
  const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet. Finish setup first.', { status: 409 })
  const where = ['f.operating_day BETWEEN ? AND ?']
  const params: unknown[] = [fromDay, toDay]
  if (scope.spaceId) {
    where.push('f.space_id = ?')
    params.push(scope.spaceId)
  }
  else if (scope.venueId) {
    where.push('f.venue_id = ?')
    params.push(scope.venueId)
  }
  const rows = await all<Row>(`SELECT f.id, f.production_id, p.title AS production_title, f.label, f.venue_id, f.space_id, f.starts_at, f.ends_at, f.operating_day, f.state
    FROM core_performances f JOIN core_productions p ON p.id = f.production_id
    WHERE ${where.join(' AND ')} ORDER BY f.starts_at, f.id`, ...params)
  const from = (await dayBounds(fromDay)).start
  const to = (await dayBounds(toDay)).end
  const closures = await closuresBetween(from, to, scope)
  return {
    performances: rows.map(r => ({
      id: r.id, productionId: r.production_id, productionTitle: r.production_title, label: r.label, venueId: r.venue_id, spaceId: r.space_id,
      startsAt: r.starts_at, endsAt: r.ends_at, operatingDay: r.operating_day, state: r.state,
    })),
    // The last day is the one holding the closure's final instant, not the one it ends on.
    closures: closures.map(c => ({ ...c, firstDay: operatingDayAt(c.startsAt, rule), lastDay: operatingDayAt(c.endsAt - 1, rule) })),
  }
}
