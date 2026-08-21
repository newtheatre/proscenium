import { db, schema } from '@nuxthub/db'
import { and, eq, gte, lte } from 'drizzle-orm'
import type { AbilityUser } from '~~/shared/utils/abilities'
import { isStaff } from '~~/shared/utils/abilities'

/**
 * Comps need a duty manager's approval, so a request expires rather than
 * waiting for ever (docs/13 §4.1.2).
 */
export const COMP_WINDOW_MINUTES = 10

/**
 * Expiry is derived, never trusted to a sweep: a request that outlived the
 * window is expired whether or not anything has got round to marking it.
 */
export function compExpired(requestedAt: string, now: Date = new Date()): boolean {
  const asked = new Date(`${requestedAt.replace(' ', 'T')}Z`).getTime()
  if (Number.isNaN(asked)) return false
  return now.getTime() - asked > COMP_WINDOW_MINUTES * 60_000
}

/** Tonight's confirmed duty manager, or `BOX_OFFICE`+ when there is none. */
export async function mayApproveComps(user: AbilityUser | null | undefined, night: string): Promise<boolean> {
  if (!user) return false
  if (isStaff(user)) return true

  const row = await db.select({ id: schema.performanceShifts.id })
    .from(schema.performanceShifts)
    .innerJoin(schema.performances, eq(schema.performanceShifts.performanceId, schema.performances.id))
    .where(and(
      eq(schema.performanceShifts.userId, user.id),
      eq(schema.performanceShifts.role, 'DUTY_MANAGER'),
      eq(schema.performanceShifts.status, 'CONFIRMED'),
      gte(schema.performances.startsAt, validityStart(night)),
      lte(schema.performances.startsAt, validityEnd(night)),
    ))
    .get()

  return Boolean(row)
}

export function requireCompApprover(may: boolean): void {
  if (!may) {
    throw createError({ statusCode: 403, statusMessage: 'Only tonight’s duty manager can approve a comp.' })
  }
}
