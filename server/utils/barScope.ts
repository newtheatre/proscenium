import { db, schema } from '@nuxthub/db'
import { and, eq, gte, lte } from 'drizzle-orm'
import type { AbilityUser } from '~~/shared/utils/abilities'
import { isStaff } from '~~/shared/utils/abilities'

/**
 * Who may work the till tonight. A `BAR` shift, or `BOX_OFFICE`+ as everywhere
 * else. A `DOOR` shift is not enough: the door never sells (docs/13 §5).
 */
export async function canWorkBarTonight(user: AbilityUser | null | undefined, night: string): Promise<boolean> {
  if (!user) return false
  if (isStaff(user)) return true

  const row = await db.select({ id: schema.performanceShifts.id })
    .from(schema.performanceShifts)
    .innerJoin(schema.performances, eq(schema.performanceShifts.performanceId, schema.performances.id))
    .where(and(
      eq(schema.performanceShifts.userId, user.id),
      eq(schema.performanceShifts.role, 'BAR'),
      eq(schema.performanceShifts.status, 'CONFIRMED'),
      gte(schema.performances.startsAt, validityStart(night)),
      lte(schema.performances.startsAt, validityEnd(night)),
    ))
    .get()

  return Boolean(row)
}

/**
 * Guard for the till and its writes. The comps queue uses the FOH scope
 * instead, because the duty manager approving is not always on the bar.
 */
export async function requireBarScope(user: AbilityUser | null | undefined, night: string = showNightDate()): Promise<string> {
  if (!await canWorkBarTonight(user, night)) {
    throw createError({ statusCode: 403, statusMessage: 'The till is for whoever is on the bar tonight.' })
  }
  return night
}
