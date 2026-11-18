// Where a till receipt goes, as a route takes it: a person the seller found, or an address typed.
import { z } from 'zod'
import { refuse } from '#kit'
import { addressFor, canonicalAccount } from '#modules/core'
import type { Destination } from './points/settlement'

export const receiptTo = z.union([
  z.object({ accountId: z.string().min(1).max(64) }).strict(), // not-policy: an id
  z.object({ email: z.email().max(254) }).strict(), // not-policy: an address's longest
])

/** The person picked, as their surviving account, refused when there is no address to send to. */
export async function resolveReceipt(to: { accountId?: string, email?: string } | undefined): Promise<Destination | undefined> {
  if (!to) return undefined
  if (to.email) return { email: to.email.trim() }
  const accountId = await canonicalAccount(to.accountId!)
  if (!await addressFor(accountId, 'audience')) refuse('payments.till.no-address', 'There is no email address for this person, so a receipt cannot be sent.', { status: 422, remedy: 'Type their email address instead.' })
  return { accountId }
}
