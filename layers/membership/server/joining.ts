// Shared checks for writing an active membership straight away: staff adding a member (G1 to G4)
// and joining a free scheme with nothing to check (J2, MEM-11).
import { first, refuse } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { lengthOptions, type LengthOption, type Scheme } from './schemes'

/** The length a membership is for: the one chosen, or the only one offered. Null for an indefinite scheme. */
export async function chooseLength(scheme: Scheme, lengthOptionId: string | null | undefined, allowWithdrawn = false): Promise<LengthOption | null> {
  if (scheme.lengthRule === 'indefinite') return null
  const options = (await lengthOptions([scheme.id])).get(scheme.id)!.filter(o => allowWithdrawn || o.state === 'offered')
  if (lengthOptionId) {
    const option = options.find(o => o.id === lengthOptionId)
    if (!option) refuse('membership.option.unknown', 'That length is not offered on this scheme.', { status: 422, fields: { lengthOptionId: 'membership.option.unknown' } })
    return option!
  }
  if (options.length === 1) return options[0]!
  refuse('membership.option.choose', 'Choose how long the membership is for.', { status: 422, fields: { lengthOptionId: 'membership.option.choose' } })
}

/** An open application by this person for this scheme, which a later slice lets them finish. */
export async function pendingOf(accountId: string, schemeId: string): Promise<string | null> {
  const row = await first<{ id: string }>(`SELECT id FROM membership_memberships WHERE scheme_id = ?1 AND state = 'pending' AND account_id IN (${accountScopeSql('?2')})`, schemeId, accountId)
  return row?.id ?? null
}
