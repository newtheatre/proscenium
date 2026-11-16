// Security notices about an account (part 4, "Notification types"): a credential added, a recovery
// used, an address changed or removed, and the link that verifies an address. Each goes to named
// addresses (every verified one, the old one, the new one) rather than to a side, so it is sent
// by notifyAddress from a job after the change commits: notify() reaches an account's one address
// on a side, not named ones. The addresses, and any link, travel sealed in the job's payload, and
// the verifying link is a sealed variable.
import { newId, type UnitView } from '#kit'
import { sealValue } from './crypto'
import { verifiedAddressesOf } from './accounts'

export type NoticeType = 'core.credential-added' | 'core.address-changed' | 'core.members-address-changed' | 'core.address-verify'

export interface Notice { type: NoticeType, addresses: string[], variables: Record<string, string>, key: string }

/** Queues one notice to each of these addresses. `key` makes a retried job send nothing twice. */
export async function queueNotice(unit: UnitView, type: NoticeType, addresses: string[], variables: Record<string, string> = {}): Promise<void> {
  const list = [...new Set(addresses)]
  if (!list.length) return
  const notice: Notice = { type, addresses: list, variables, key: newId('ntc', { random: true }) }
  unit.enqueue('core.send-account-notice', { sealed: await sealValue('account-notice', notice) })
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
