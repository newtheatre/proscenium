import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm'
import type { AbilityUser } from '~~/shared/utils/abilities'
import { canWorkFoh, isStaff } from '~~/shared/utils/abilities'

/**
 * Who may see what on a show night. The role grants the capability; a confirmed
 * shift grants the scope (ADR-0019). Design: docs/11-show-night-screen-design.md
 */

/**
 * A show night belongs to the day it started on until the small hours, so a
 * screen open at 00:30 still shows the night that is ending.
 */
export const NIGHT_ROLLS_OVER_HOUR = 4

/**
 * The `YYYY-MM-DD` whose show night `now` falls in, in Europe/London. Reads the
 * wall clock: subtracting four hours is wrong on the two DST nights a year.
 */
export function showNightDate(now: Date = new Date()): string {
  const london = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }))
  if (london.getHours() < NIGHT_ROLLS_OVER_HOUR) london.setDate(london.getDate() - 1)
  return `${london.getFullYear()}-${String(london.getMonth() + 1).padStart(2, '0')}-${String(london.getDate()).padStart(2, '0')}`
}

/**
 * The instants a show night actually covers: 04:00 to 04:00, not a calendar
 * day. A refusal logged at 00:20 belongs to the night that is still running.
 */
export function showNightWindow(night: string): { from: Date, to: Date } {
  const from = londonInstant(night, NIGHT_ROLLS_OVER_HOUR, 0, 0, 0)
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1) }
}

export interface FohPerformance {
  id: string
  startsAt: Date
  doorsAt: Date | null
  showTitle: string
  showSlug: string
  venueName: string
  /** The acting user's confirmed role tonight, or null when they hold none. */
  shiftRole: 'DUTY_MANAGER' | 'DOOR' | 'BAR' | null
}

export interface FohScope {
  night: string
  performances: FohPerformance[]
  /** True when staff seniority granted this rather than a shift (ADR-0019). */
  bypassedRota: boolean
  /** True when the user could work but is rostered on nothing tonight. */
  rosteredOnNothing: boolean
}

/**
 * Never throws. A user with no shift is a user with no performances, which the
 * screen renders as an empty state rather than an error (ADR-0008).
 */
export async function fohScope(user: AbilityUser | null | undefined, now: Date = new Date()): Promise<FohScope> {
  const night = showNightDate(now)
  const empty: FohScope = { night, performances: [], bypassedRota: false, rosteredOnNothing: false }
  if (!user || !canWorkFoh(user)) return empty

  const bypassedRota = isStaff(user)

  const rows = await db.select({
    id: schema.performances.id,
    startsAt: schema.performances.startsAt,
    doorsAt: schema.performances.doorsAt,
    showTitle: schema.shows.title,
    showSlug: schema.shows.slug,
    venueName: schema.venues.name,
    shiftRole: schema.performanceShifts.role,
    shiftStatus: schema.performanceShifts.status,
    shiftUserId: schema.performanceShifts.userId,
  })
    .from(schema.performances)
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .leftJoin(schema.performanceShifts, and(
      eq(schema.performanceShifts.performanceId, schema.performances.id),
      eq(schema.performanceShifts.userId, user.id),
      eq(schema.performanceShifts.status, 'CONFIRMED'),
    ))
    .where(and(
      gte(schema.performances.startsAt, validityStart(night)),
      lte(schema.performances.startsAt, validityEnd(night)),
      ne(schema.performances.status, 'CANCELLED'),
      // Not our building, so there is no night of ours to run (ADR-0029).
      ourBuildingPredicate(),
    ))
    .orderBy(asc(schema.performances.startsAt))

  const mine = rows.filter(row => row.shiftUserId === user.id)
  const visible = bypassedRota ? rows : mine

  return {
    night,
    performances: visible.map(row => ({
      id: row.id,
      startsAt: row.startsAt,
      doorsAt: row.doorsAt,
      showTitle: row.showTitle,
      showSlug: row.showSlug,
      venueName: row.venueName,
      shiftRole: row.shiftUserId === user.id ? row.shiftRole : null,
    })),
    bypassedRota,
    rosteredOnNothing: !bypassedRota && mine.length === 0,
  }
}

/**
 * Narrow a scope to one performance. Refuses anything the caller is not on
 * tonight, so a performance id from elsewhere is not a way round the rota.
 */
export function scopedPerformance(scope: FohScope, performanceId: string | undefined): FohPerformance {
  const performance = scope.performances.find(p => p.id === performanceId)
  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'That performance is not one of tonight\'s, or you are not working it.' })
  }
  return performance
}

/** Guard for a show-night route. Throws only when the user may not be here at all. */
export async function requireFohScope(user: AbilityUser | null | undefined, now: Date = new Date()): Promise<FohScope> {
  const scope = await fohScope(user, now)
  if (!user || !canWorkFoh(user)) {
    throw createError({ statusCode: 403, statusMessage: 'This screen is for front-of-house staff working tonight.' })
  }
  return scope
}
