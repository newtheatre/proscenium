import { db, schema } from '@nuxthub/db'
import { and, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm'

/**
 * Whether someone may book the access ticket types, and how many are left to
 * them at this performance. One copy, same discipline as `canRedeem`.
 */

/** The holder's own ticket: one seat, not a quantity (docs/12 §2.6). */
export const ACCESS_TICKETS_PER_PERFORMANCE = 1

export interface AccessBookingRights {
  allowed: boolean
  /** Companion tickets this profile is entitled to, per performance. */
  companions: number
  /** Entitlement less what is already held for this performance. */
  companionsRemaining: number
  accessRemaining: number
}

const NONE: AccessBookingRights = { allowed: false, companions: 0, companionsRemaining: 0, accessRemaining: 0 }

/**
 * Verification is account-level, which is the point: a guest has no account
 * to attach it to, so guests never qualify.
 */
export async function canBookAccessTickets(
  userId: string | null | undefined,
  performanceId: string,
  opts: { excludeReservationId?: string } = {},
): Promise<AccessBookingRights> {
  if (!userId) return NONE

  const profile = await db.select({
    companions: schema.accessProfiles.companions,
  })
    .from(schema.accessProfiles)
    .where(and(
      eq(schema.accessProfiles.userId, userId),
      eq(schema.accessProfiles.status, 'VERIFIED'),
      isNotNull(schema.accessProfiles.consentFohAt),
      gte(schema.accessProfiles.expiresAt, new Date()),
    ))
    .get()

  if (!profile) return NONE

  const held = await heldAccessTickets(userId, performanceId, opts.excludeReservationId)

  return {
    allowed: true,
    companions: profile.companions,
    companionsRemaining: Math.max(0, profile.companions - held.companions),
    accessRemaining: Math.max(0, ACCESS_TICKETS_PER_PERFORMANCE - held.access),
  }
}

/**
 * Access tickets this booker already holds at this performance. The basket
 * being edited is excluded, because it is replaced rather than added to.
 */
async function heldAccessTickets(userId: string, performanceId: string, excludeReservationId?: string) {
  const rows = await db.select({
    accessKind: schema.ticketTypes.accessKind,
    held: sql<number>`count(*)`,
  })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.reservations.id, schema.tickets.reservationId))
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(and(
      eq(schema.reservations.userId, userId),
      eq(schema.reservations.performanceId, performanceId),
      isNotNull(schema.ticketTypes.accessKind),
      isNull(schema.tickets.refundedAt),
      // A cancelled or no-show booking has given the entitlement back.
      ne(schema.reservations.status, 'CANCELLED'),
      ne(schema.reservations.status, 'NO_SHOW'),
      excludeReservationId ? ne(schema.reservations.id, excludeReservationId) : undefined,
    ))
    .groupBy(schema.ticketTypes.accessKind)

  const count = (kind: string) => Number(rows.find(r => r.accessKind === kind)?.held ?? 0)
  return { access: count('ACCESS'), companions: count('COMPANION') }
}

/**
 * Refuses a basket that asks for access types the booker is not entitled to.
 * Called by every path that creates tickets, not just the public one.
 */
export async function assertAccessTicketsAllowed(
  userId: string | null | undefined,
  performanceId: string,
  requested: Array<{ ticketTypeId: string, quantity: number }>,
  opts: { excludeReservationId?: string } = {},
): Promise<void> {
  const types = await db.select({
    id: schema.ticketTypes.id,
    accessKind: schema.ticketTypes.accessKind,
  }).from(schema.ticketTypes)

  const kindOf = new Map(types.map(t => [t.id, t.accessKind]))
  const wanted = requested.filter(line => kindOf.get(line.ticketTypeId))
  if (!wanted.length) return

  const rights = await canBookAccessTickets(userId, performanceId, opts)
  if (!rights.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access tickets need a verified access profile on your account. Set one up in your account, or call the box office.',
    })
  }

  const asked = (kind: string) => wanted
    .filter(line => kindOf.get(line.ticketTypeId) === kind)
    .reduce((total, line) => total + line.quantity, 0)

  if (asked('ACCESS') > rights.accessRemaining) {
    throw createError({
      statusCode: 403,
      statusMessage: rights.accessRemaining
        ? 'An access ticket is your own seat, so there is one per performance.'
        : 'You already have an access ticket for this performance.',
    })
  }

  const companions = asked('COMPANION')
  if (companions > rights.companionsRemaining) {
    throw createError({
      statusCode: 403,
      statusMessage: companionMessage(rights),
    })
  }
}

/** Says what is left, not just what the profile allows: the difference matters. */
function companionMessage(rights: AccessBookingRights): string {
  if (!rights.companions) return 'Your profile does not include an essential companion.'
  if (!rights.companionsRemaining) {
    return `You have already booked ${rights.companions === 1 ? 'your companion ticket' : 'all your companion tickets'} for this performance.`
  }
  return `Your profile covers ${rights.companions} companion ticket${rights.companions === 1 ? '' : 's'} per performance, and you have ${rights.companionsRemaining} left.`
}
