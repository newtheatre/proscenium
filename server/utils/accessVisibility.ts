import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm'
import type { AbilityUser } from '~~/shared/utils/abilities'
import { canVerifyAccess } from '~~/shared/utils/abilities'

/**
 * Who may see access needs, and whose. Narrow by construction: all three
 * clauses, or nothing (ADR-0022). Design: docs/12 §2.5
 */

export interface AccessTonightEntry {
  reservationId: string
  firstName: string
  partySize: number
  needs: string[]
  companions: number
  fohNote: string | null
}

/**
 * **`BOX_OFFICE` gets no bypass here**, unlike every other show-night surface.
 * A confirmed shift on this performance today, or `access.verify`, and nothing else.
 */
export async function maySeeAccessNeeds(
  user: AbilityUser | null | undefined,
  performanceId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!user) return false
  if (canVerifyAccess(user)) return true

  const night = showNightDate(now)
  const row = await db.select({ id: schema.performanceShifts.id })
    .from(schema.performanceShifts)
    .innerJoin(schema.performances, eq(schema.performanceShifts.performanceId, schema.performances.id))
    .where(and(
      eq(schema.performanceShifts.performanceId, performanceId),
      eq(schema.performanceShifts.userId, user.id),
      eq(schema.performanceShifts.status, 'CONFIRMED'),
      // On the day of that performance, not merely at some point in its run.
      gte(schema.performances.startsAt, validityStart(night)),
      lte(schema.performances.startsAt, validityEnd(night)),
    ))
    .get()

  return Boolean(row)
}

/** The symbols a profile actually carries, as stable keys. */
function symbolsOf(profile: Record<string, unknown>): string[] {
  return schema.ACCESS_NEEDS.filter(key => profile[key] === true)
}

/**
 * Consented, verified, unexpired profiles of people holding a booking on this
 * performance. Returns nothing at all when the caller may not see them.
 */
export async function accessTonight(
  user: AbilityUser | null | undefined,
  performanceId: string,
  now: Date = new Date(),
): Promise<AccessTonightEntry[]> {
  if (!await maySeeAccessNeeds(user, performanceId, now)) return []

  const rows = await db.select({
    reservationId: schema.reservations.id,
    name: schema.users.name,
    companions: schema.accessProfiles.companions,
    fohNote: schema.accessProfiles.fohNote,
    difficultyStanding: schema.accessProfiles.difficultyStanding,
    difficultyWithCrowds: schema.accessProfiles.difficultyWithCrowds,
    levelAccess: schema.accessProfiles.levelAccess,
    distance: schema.accessProfiles.distance,
    urgentToilet: schema.accessProfiles.urgentToilet,
    visualInformation: schema.accessProfiles.visualInformation,
    audibleInformation: schema.accessProfiles.audibleInformation,
    miscellaneous: schema.accessProfiles.miscellaneous,
    partySize: sql<number>`(
      select count(*) from tickets t
      join ticket_types tt on tt.id = t.ticket_type_id
      where t.reservation_id = ${schema.reservations.id}
        and t.refunded_at is null
        and tt.kind <> 'PASS_SALE'
    )`,
  })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.accessProfiles.userId, schema.users.id))
    .innerJoin(schema.reservations, eq(schema.reservations.userId, schema.accessProfiles.userId))
    .where(and(
      eq(schema.reservations.performanceId, performanceId),
      ne(schema.reservations.status, 'CANCELLED'),
      eq(schema.accessProfiles.status, 'VERIFIED'),
      // No consent, nothing shown. This is the lawful basis (ADR-0022).
      isNotNull(schema.accessProfiles.consentFohAt),
      gte(schema.accessProfiles.expiresAt, now),
    ))
    .orderBy(asc(schema.users.name))

  return rows.map(row => ({
    // The key a caller must match on: names are neither unique nor stable.
    reservationId: row.reservationId,
    // A first name is what the door needs to greet somebody by.
    firstName: row.name.split(' ')[0] ?? row.name,
    partySize: Number(row.partySize ?? 0),
    needs: symbolsOf(row),
    companions: row.companions,
    fohNote: row.fohNote,
  }))
}
