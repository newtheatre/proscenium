// Security notices about an account (part 4, "Notification types"): a credential added, a recovery
// used, an address changed or removed, and the link that verifies an address. Each goes to named
// addresses (every verified one, the old one, the new one) rather than to a side, so each address
// gets its own notifyAddress, written in the change's unit and sent once it commits. The verifying
// link is a sealed variable: kept encrypted, sent by email only and cleared once sent.
import { newId, type UnitView } from '#kit'
import { notifyAddress } from '../notifications/send'
import { verifiedAddressesOf } from './accounts'

export type NoticeType = 'core.credential-added' | 'core.address-changed' | 'core.members-address-changed' | 'core.address-verify' | 'core.merge-notice'

/** One notice to each of these addresses, in the caller's unit. */
export async function queueNotice(unit: UnitView, type: NoticeType, addresses: string[], variables: Record<string, string> = {}): Promise<void> {
  const key = newId('ntc', { random: true })
  for (const address of new Set(addresses)) await notifyAddress(unit, type, { address, variables, dedupeKey: `${key}:${address}` })
}

/** What was added, in the words of the core.credential-added message. */
export const CREDENTIAL = {
  'passkey': 'a passkey',
  'recovery-codes': 'a new set of recovery codes',
  'recovery-used': 'a recovery code, used to sign in',
  'enrolment-link': 'a link from the theatre for adding a passkey',
} as const

/** Tells every verified address of an account that a way to sign in was added or used (ID-08, ID-14). */
export async function credentialNotice(unit: UnitView, accountId: string, what: keyof typeof CREDENTIAL): Promise<void> {
  await queueNotice(unit, 'core.credential-added', await verifiedAddressesOf(accountId), { what: CREDENTIAL[what] })
}
