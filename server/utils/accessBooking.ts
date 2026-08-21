import { db, schema } from '@nuxthub/db'
import { and, eq, gte, isNotNull } from 'drizzle-orm'

/**
 * Whether someone may book the access ticket types, and how many companions.
 * One copy, same discipline as `canRedeem` (docs/12 §2.6).
 */

export interface AccessBookingRights {
  allowed: boolean
  /** Companion tickets this profile is entitled to, per performance. */
  companions: number
}

const NONE: AccessBookingRights = { allowed: false, companions: 0 }

/**
 * Verification is account-level, which is the point: a guest has no account
 * to attach it to, so guests never qualify.
 */
export async function canBookAccessTickets(userId: string | null | undefined): Promise<AccessBookingRights> {
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
  return { allowed: true, companions: profile.companions }
}

/**
 * Refuses a basket that asks for access types the booker is not entitled to.
 * Called by every path that creates tickets, not just the public one.
 */
export async function assertAccessTicketsAllowed(
  userId: string | null | undefined,
  requested: Array<{ ticketTypeId: string, quantity: number }>,
): Promise<void> {
  const types = await db.select({
    id: schema.ticketTypes.id,
    accessKind: schema.ticketTypes.accessKind,
  }).from(schema.ticketTypes)

  const kindOf = new Map(types.map(t => [t.id, t.accessKind]))
  const wanted = requested.filter(line => kindOf.get(line.ticketTypeId))
  if (!wanted.length) return

  const rights = await canBookAccessTickets(userId)
  if (!rights.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access tickets need a verified access profile on your account. Set one up in your account, or call the box office.',
    })
  }

  const companions = wanted
    .filter(line => kindOf.get(line.ticketTypeId) === 'COMPANION')
    .reduce((total, line) => total + line.quantity, 0)

  if (companions > rights.companions) {
    throw createError({
      statusCode: 403,
      statusMessage: rights.companions
        ? `Your profile covers ${rights.companions} companion ticket${rights.companions === 1 ? '' : 's'} per performance.`
        : 'Your profile does not include an essential companion.',
    })
  }
}
