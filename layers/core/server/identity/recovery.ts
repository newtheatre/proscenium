// Recovering a lost passkey (ID-08; part 3, "Signing in"). A recovery code, or a single-use
// enrolment link a member of staff issues, opens a session good for one thing: enrolling a new
// passkey. Every recovery tells all the account's verified addresses.
import type { H3Event } from 'h3'
import { first, newId, nowMs, refuse, useSetting, siteUrl, type Actor, type UnitView } from '#kit'
import { countAgainstRate } from '#kit/ratelimit'
import { addressRow, accountById, isUsable, normaliseAddress } from './accounts'
import { digest, normaliseRecoveryCode, randomToken } from './crypto'
import { credentialNotice } from './notices'
import { startSession } from './sessions'

/** Where a recovery session goes: the page that enrols a passkey. */
export const ENROL_PATH = '/account/passkey'

const WRONG = { code: 'core.recovery.code-wrong', reason: 'That address and code do not match.', remedy: 'Check the code, or ask the theatre for a link to add a passkey.' }

/**
 * Uses a recovery code. The answer is the same whether the address is unknown or the code wrong, and
 * the code is spent by a conditional write, so it works once even in a race.
 */
export async function useRecoveryCode(unit: UnitView, event: H3Event, input: { address: string, code: string }): Promise<{ next: string }> {
  const address = normaliseAddress(input.address)
  if (!(await countAgainstRate('sign-in', `address:${address}`)).allowed) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  const row = await addressRow(address)
  const account = row?.verified_at ? await accountById(row.account_id) : null
  if (!isUsable(account) || !account.first_signed_in_at) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  const hash = await digest('recovery', normaliseRecoveryCode(input.code))
  const code = await first<{ id: string }>('SELECT id FROM core_recovery_codes WHERE account_id = ? AND code_hash = ? AND used_at IS NULL', account.id, hash)
  if (!code) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  unit.add({ sql: 'UPDATE core_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', params: [nowMs(), code.id] }).expect(1, WRONG)
  await startSession(unit, event, { accountId: account.id, methods: ['recovery'], assurance: 'basic' })
  unit.audit({ action: 'sign-in', record: ['core.account', account.id], detail: { method: 'recovery-code' } })
  await credentialNotice(unit, account.id, 'recovery-used')
  return { next: ENROL_PATH }
}

/**
 * Staff issue a single-use link that opens a recovery session for somebody locked out (ID-08). The
 * route guard refuses a privileged ability on one's own record, so a member of staff who is locked
 * out asks a colleague. The link is shown once to the staff member, who hands it over; the person's
 * verified addresses are told it was issued.
 */
export async function issueEnrolmentLink(unit: UnitView, event: H3Event, actor: Actor, accountId: string): Promise<{ link: string, expiresAt: number }> {
  const account = await accountById(accountId)
  if (!isUsable(account) || !account.first_signed_in_at) refuse('core.recovery.not-usable', 'This account cannot be recovered.', { status: 409, remedy: 'Check it is enabled and has signed in before.' })
  const token = randomToken()
  const at = nowMs()
  const lifetime = await useSetting('core.recovery.enrolment-link-lifetime') as number
  const expiresAt = at + lifetime * 1000 // not-policy: seconds to milliseconds
  // A new link replaces any earlier one still waiting.
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE purpose = \'enrol_passkey\' AND account_id = ? AND used_at IS NULL', params: [at, accountId] })
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, issued_by, attempts, created_at, expires_at)
          VALUES (?, 'enrol_passkey', ?, ?, ?, 0, ?, ?)`,
    params: [newId('tok', { random: true }), await digest('link', token), accountId, actor.accountId ?? null, at, expiresAt],
  })
  unit.audit({ action: 'create', ability: 'core.account.recover', record: ['core.account', accountId] })
  await credentialNotice(unit, accountId, 'enrolment-link')
  return { link: await siteUrl(`/sign-in/link#${token}`), expiresAt }
}

/** Uses an enrolment link: a recovery session for the account it names, spent once. */
export async function useEnrolmentLink(unit: UnitView, event: H3Event, row: { id: string, account_id: string | null }): Promise<{ accountId: string, next: string }> {
  const account = row.account_id ? await accountById(row.account_id) : null
  if (!isUsable(account)) refuse('core.sign-in.link-unknown', 'This link is not valid.', { status: 410, remedy: 'Ask the theatre for a new one.' })
  await startSession(unit, event, { accountId: account.id, methods: ['recovery'], assurance: 'basic' })
  unit.audit({ action: 'sign-in', record: ['core.account', account.id], detail: { method: 'enrolment-link' } })
  return { accountId: account.id, next: ENROL_PATH }
}
