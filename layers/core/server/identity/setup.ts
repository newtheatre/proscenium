// First-run setup makes the first Owner (ID-37). It runs only while no Owner role exists, and it
// will not finish without a passkey and a recovery code typed back. Between steps, what has been
// given travels in a sealed cookie; nothing is written until the last step, which writes
// everything in one batch guarded by "no Owner role yet".
import type { H3Event } from 'h3'
import { first, newId, nowMs, refuse, type UnitView } from '#kit'
import { openValue, sealValue } from './crypto'
import { SETUP_COOKIE, clearCookie, readCookie, setShortCookie } from './web'
import { OWNER } from './grants'
import type { NewCredential } from './passkeys'

export const SETUP_LIFETIME = 30 * 60 // not-policy: seconds a person has to finish the three setup steps

export interface SetupTicket {
  name: string
  address: string
  /** The theatre's name and time zone, asked at setup (AC-11) and saved with the Owner. */
  theatre?: string
  timeZone?: string
  userId: string
  challengeId: string
  credential?: NewCredential
  codes?: string[]
}

export async function setupNeeded(): Promise<boolean> {
  return !(await first('SELECT 1 AS one FROM core_roles WHERE key = ?', OWNER))
}

export async function requireSetupNeeded(): Promise<void> {
  if (!(await setupNeeded())) refuse('core.setup.done', 'This site is already set up.', { status: 409, remedy: 'Sign in instead.' })
}

export async function readTicket(event: H3Event): Promise<SetupTicket> {
  const ticket = await openValue<SetupTicket>('setup', readCookie(event, SETUP_COOKIE))
  if (!ticket) refuse('core.setup.expired', 'Setup took too long, or was started in another browser.', { status: 410, remedy: 'Start again.' })
  return ticket
}

export async function writeTicket(event: H3Event, ticket: SetupTicket): Promise<void> {
  setShortCookie(event, SETUP_COOKIE, await sealValue('setup', ticket), SETUP_LIFETIME)
}

export function clearTicket(event: H3Event): void {
  clearCookie(event, SETUP_COOKIE)
}

/**
 * Writes the Owner: the fixed Owner role, the account and its verified address, the passkey, the
 * recovery codes and the setup grant. The very first grant is the only one a person gives
 * themselves; the database refuses any other.
 */
export function writeOwner(unit: UnitView, ticket: SetupTicket & { credential: NewCredential }): { accountId: string, roleId: string, grantId: string } {
  const at = nowMs()
  const roleId = newId('rol')
  const accountId = ticket.userId
  const emailId = newId('aem')
  const grantId = newId('gra')
  unit.add({
    sql: 'INSERT INTO core_roles (id, key, name, description, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) SELECT ?, ?, \'Owner\', \'Everything, including Owners and recovery.\', 1, 1, 0, \'none\', ? WHERE NOT EXISTS (SELECT 1 FROM core_roles WHERE key = ?)',
    params: [roleId, OWNER, at, OWNER],
  }).expect(1, { code: 'core.setup.done', reason: 'This site is already set up.', remedy: 'Sign in instead.' })
  unit.add({ sql: 'INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at, last_signed_in_at, audience_email_id) VALUES (?, ?, \'setup\', ?, ?, ?, ?)', params: [accountId, ticket.name, at, at, at, emailId] })
  unit.add({ sql: 'INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'setup\', ?)', params: [emailId, accountId, ticket.address, at, at] })
  unit.add({
    sql: 'INSERT INTO core_passkeys (id, account_id, credential_id, public_key, sign_count, transports, synced, label, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('pky'), accountId, ticket.credential.credentialId, ticket.credential.publicKey, ticket.credential.signCount, JSON.stringify(ticket.credential.transports), ticket.credential.synced ? 1 : 0, 'Set up this site', at, at],
  })
  unit.add({ sql: 'INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, ?, ?)', params: [grantId, accountId, roleId, at, accountId, at] })
  unit.announce('core.account.created', { accountId, origin: 'setup' }, { record: ['core.account', accountId] })
  unit.announce('core.grant.created', { grantId, accountId, roleId }, { record: ['core.grant', grantId] })
  return { accountId, roleId, grantId }
}
