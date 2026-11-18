// Shared checks for writing an active membership straight away: staff adding a member (G1 to G4)
// and joining a free scheme with nothing to check (J2, MEM-11); and writing an application that
// waits for its fee (P1).
import { first, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { requireCharger } from './charge'
import { writePending } from './memberships'
import type { ChargeQuote } from './points/charge'
import { lengthOptions, type LengthOption, type Scheme } from './schemes'

/** The length a membership is for: the one chosen, or the only one offered. Null for an indefinite scheme. */
export async function chooseLength(scheme: Scheme, lengthOptionId: string | null | undefined, allowWithdrawn = false, firstIfNone = false): Promise<LengthOption | null> {
  if (scheme.lengthRule === 'indefinite') return null
  const options = (await lengthOptions([scheme.id])).get(scheme.id)!.filter(o => allowWithdrawn || o.state === 'offered')
  if (lengthOptionId) {
    const option = options.find(o => o.id === lengthOptionId)
    if (!option) refuse('membership.option.unknown', 'That length is not offered on this scheme.', { status: 422, fields: { lengthOptionId: 'membership.option.unknown' } })
    return option!
  }
  if (options.length === 1) return options[0]!
  // A scheme whose list sets the end date asks for no length (D9); an entry without one takes the first.
  if (firstIfNone && options.length) return options[0]!
  refuse('membership.option.choose', 'Choose how long the membership is for.', { status: 422, fields: { lengthOptionId: 'membership.option.choose' } })
}

/** An open application by this person for this scheme, and what it waits on: staff's check, or its fee. */
export async function pendingOf(accountId: string, schemeId: string): Promise<{ id: string, waiting: 'staff-check' | 'payment' } | null> {
  const row = await first<{ id: string, waiting_on_staff: number }>(`SELECT id, (needs_verification = 1 AND verified_at IS NULL) AS waiting_on_staff FROM membership_memberships WHERE scheme_id = ?1 AND state = 'pending' AND account_id IN (${accountScopeSql('?2')})`, schemeId, accountId)
  return row ? { id: row.id, waiting: row.waiting_on_staff ? 'staff-check' : 'payment' } : null
}

/**
 * An application for a scheme that requires payment (P1, J1): pending, with its charge for the price
 * in force today added to the same unit. One whose check has passed waits only for the fee, and
 * expires if it is not paid in time (J5); one waiting on staff is charged now and paid once they pass
 * it (A2), and does not expire while it waits.
 */
export async function writePaying(unit: UnitView, input: { scheme: Scheme, accountId: string, lengthOptionId: string | null, renewsId?: string | null, verified: boolean, day: string }): Promise<{ membershipId: string, quote: ChargeQuote }> {
  const fees = await requireCharger()
  const expiresAt = input.verified ? nowMs() + (await useSetting('membership.applications.expire-after') as number) * 1000 : null // not-policy: seconds to milliseconds
  const membershipId = writePending(unit, { scheme: input.scheme, accountId: input.accountId, lengthOptionId: input.lengthOptionId, renewsId: input.renewsId, verified: input.verified, paying: true, expiresAt })
  const quote = await fees.open(unit, { membershipId, schemeId: input.scheme.id, lengthOptionId: input.lengthOptionId, kind: input.renewsId ? 'renew' : 'join', on: input.day })
  return { membershipId, quote }
}
