// Security notices about an account (part 4, "Notification types"): a credential added, a recovery
// used, an address changed or removed, and the link that verifies an address. Each goes to named
// addresses (every verified one, the old one, the new one) rather than to a side, so each address
// gets its own notifyAddress, written in the change's unit and sent once it commits. The verifying
// link is a sealed variable: kept encrypted, sent by email only and cleared once sent.
import { first, isRefusal, newId, nowMs, theatreTimeZone, useSetting, wordsFrom, type UnitView } from '#kit'
import roleWords from '../../i18n/en-GB/roles.json'
import { notifyAddress } from '../notifications/send'
import { notify } from '../notifications/notify'
import { verifiedAddressesOf } from './accounts'

const say = wordsFrom(roleWords)

export type NoticeType = 'core.credential-added' | 'core.address-changed' | 'core.members-address-changed' | 'core.address-verify' | 'core.merge-notice' | 'core.merge-undone'

/** The theatre's time zone for a date in a notice, or UTC before setup has set one. */
async function zone(): Promise<string> {
  try {
    return await theatreTimeZone()
  }
  catch (error) {
    if (isRefusal(error)) return 'UTC'
    throw error
  }
}

/** One notice to each of these addresses, in the caller's unit. */
export async function queueNotice(unit: UnitView, type: NoticeType, addresses: string[], variables: Record<string, string> = {}): Promise<void> {
  const key = newId('ntc', { random: true })
  for (const address of new Set(addresses)) await notifyAddress(unit, type, { address, variables, dedupeKey: `${key}:${address}` })
}

/** What was added, in the words of the core.credential-added message. */
export const CREDENTIAL = {
  'passkey': 'a passkey',
  'authenticator': 'an authenticator app',
  'recovery-codes': 'a new set of recovery codes',
  'recovery-used': 'a recovery code, used to sign in',
  'enrolment-link': 'a link from the theatre for adding a passkey',
} as const

/**
 * Tells every verified address of an account that a way to sign in was added or used (ID-08,
 * ID-14), with when and from which device (a short browser label, or who issued it), so the person
 * can tell whether it was them.
 */
export async function credentialNotice(unit: UnitView, accountId: string, what: keyof typeof CREDENTIAL, device: string): Promise<void> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: await zone() }).format(nowMs())
  await queueNotice(unit, 'core.credential-added', await verifiedAddressesOf(accountId), { what: CREDENTIAL[what], when, device })
}

/** The device line for a change the theatre's staff made, not the person. */
export const BY_STAFF = 'the theatre\'s staff'

/**
 * Tells a person they were given a role, or that one was taken away (EM-13). An invitation already
 * says the first, so it is not used for a person who is being invited. A grant ended only to be
 * replaced (a change or a renewal) says nothing.
 */
export async function roleNotice(unit: UnitView, accountId: string, roleId: string, change: { given: true, expiresAt: number | null } | { given: false }): Promise<void> {
  const role = await first<{ name: string }>('SELECT name FROM core_roles WHERE id = ?', roleId)
  if (!role) return
  if (!change.given) {
    await notify(unit, 'core.role-ended', { to: accountId, variables: { role: role.name } })
    return
  }
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  // An end is the first moment of the day after the last one the role counts.
  const until = change.expiresAt
    ? say('core.roles.notice.until', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: await zone() }).format(change.expiresAt - 1) })
    : say('core.roles.notice.no-end')
  await notify(unit, 'core.role-given', { to: accountId, variables: { role: role.name, until } })
}
