// Passkeys (ID-02, ID-03, ID-14, ID-37): registration and sign-in ceremonies with
// @simplewebauthn/server. A challenge is a row read back once; a passkey must be discoverable and
// verified by the device (a PIN, a fingerprint or a face), which is what makes its session strong.
import type { H3Event } from 'h3'
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { base64url, digest, fromBase64url, normaliseRecoveryCode, randomRecoveryCode } from './crypto'
import { relyingParty } from './web'

const CHALLENGE_LIFETIME = 5 * 60_000 // not-policy: a passkey ceremony takes seconds; five minutes covers a slow one
const LABEL_LENGTH = 60 // not-policy: a label is a few words

export type ChallengePurpose = 'register' | 'sign_in' | 'reassert' | 'setup' | 'owner_recovery'

export interface PasskeyRow {
  id: string
  account_id: string
  credential_id: string
  public_key: string
  sign_count: number
  transports: string | null
  label: string
  synced: number
  created_at: number
  last_used_at: number | null
}

export interface NewCredential {
  credentialId: string
  publicKey: string
  signCount: number
  transports: string[]
  synced: boolean
}

function saveChallenge(unit: UnitView, purpose: ChallengePurpose, challenge: string, accountId: string | null): string {
  const id = newId('pch', { random: true })
  unit.add({
    sql: 'INSERT INTO core_passkey_challenges (id, purpose, challenge, account_id, expires_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, purpose, challenge, accountId, nowMs() + CHALLENGE_LIFETIME],
  })
  return id
}

/** Reads a challenge back and spends it in the caller's unit, so it works exactly once. */
async function spendChallenge(unit: UnitView, id: string, purpose: ChallengePurpose): Promise<{ challenge: string, accountId: string | null }> {
  const row = await first<{ challenge: string, account_id: string | null, purpose: string, expires_at: number, used_at: number | null }>('SELECT challenge, account_id, purpose, expires_at, used_at FROM core_passkey_challenges WHERE id = ?', id)
  if (!row || row.purpose !== purpose || row.used_at || row.expires_at <= nowMs()) refuse('core.passkey.challenge-stale', 'That took too long, or the page was used twice.', { status: 410, remedy: 'Try again.' })
  unit.add({ sql: 'UPDATE core_passkey_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL', params: [nowMs(), id] })
    .expect(1, { code: 'core.passkey.challenge-stale', reason: 'That took too long, or the page was used twice.', remedy: 'Try again.' })
  return { challenge: row.challenge, accountId: row.account_id }
}

/** Options for making a new passkey. `userId` is the account id, or a fresh one during setup. */
export async function registrationOptions(unit: UnitView, event: H3Event, input: { purpose: ChallengePurpose, accountId: string | null, userId: string, userName: string, displayName: string }) {
  const rp = relyingParty(event)
  const existing = input.accountId ? await all<{ credential_id: string, transports: string | null }>('SELECT credential_id, transports FROM core_passkeys WHERE account_id = ?', input.accountId) : []
  const options = await generateRegistrationOptions({
    // The theatre's name arrives with the core domain's site settings; until then, the host.
    rpName: rp.id,
    rpID: rp.id,
    userID: new TextEncoder().encode(input.userId),
    userName: input.userName,
    userDisplayName: input.displayName,
    attestationType: 'none',
    excludeCredentials: existing.map(c => ({ id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  const challengeId = saveChallenge(unit, input.purpose, options.challenge, input.accountId)
  return { challengeId, options }
}

/** Checks a new passkey against its challenge and spends the challenge in the caller's unit. */
export async function verifyRegistration(unit: UnitView, event: H3Event, input: { challengeId: string, purpose: ChallengePurpose, response: RegistrationResponseJSON }): Promise<NewCredential & { accountId: string | null }> {
  const { challenge, accountId } = await spendChallenge(unit, input.challengeId, input.purpose)
  const rp = relyingParty(event)
  let result
  try {
    result = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true })
  }
  catch {
    refuse('core.passkey.not-verified', 'That passkey could not be checked.', { status: 422, remedy: 'Try again, or use another device.' })
  }
  if (!result.verified) refuse('core.passkey.not-verified', 'That passkey could not be checked.', { status: 422, remedy: 'Try again, or use another device.' })
  const { credential, credentialBackedUp } = result.registrationInfo
  const taken = await first('SELECT 1 AS one FROM core_passkeys WHERE credential_id = ?', credential.id)
  if (taken) refuse('core.passkey.already-added', 'This passkey is already added to an account.', { status: 409 })
  return { accountId, credentialId: credential.id, publicKey: base64url(credential.publicKey), signCount: credential.counter, transports: credential.transports ?? [], synced: credentialBackedUp }
}

export function addPasskey(unit: UnitView, accountId: string, credential: NewCredential, label: string): string {
  const id = newId('pky')
  unit.add({
    sql: 'INSERT INTO core_passkeys (id, account_id, credential_id, public_key, sign_count, transports, synced, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, accountId, credential.credentialId, credential.publicKey, credential.signCount, JSON.stringify(credential.transports), credential.synced ? 1 : 0, label.slice(0, LABEL_LENGTH), nowMs()],
  })
  return id
}

/**
 * Options for proving a passkey. With no account the browser offers every passkey it holds for the
 * site (ID-02: no address typed); with one, only that account's.
 */
export async function authenticationOptions(unit: UnitView, event: H3Event, input: { purpose: ChallengePurpose, accountId: string | null }) {
  const rp = relyingParty(event)
  const allow = input.accountId ? await all<{ credential_id: string, transports: string | null }>('SELECT credential_id, transports FROM core_passkeys WHERE account_id = ?', input.accountId) : []
  if (input.accountId && !allow.length) refuse('core.passkey.none', 'There is no passkey on this account.', { status: 409, remedy: 'Add a passkey first.' })
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'required',
    allowCredentials: allow.map(c => ({ id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
  })
  const challengeId = saveChallenge(unit, input.purpose, options.challenge, input.accountId)
  return { challengeId, options }
}

/**
 * Checks a passkey proof. A passkey removed from its account is not found, so it signs nobody in
 * even if the device still holds it. Returns the account it belongs to.
 */
export async function verifyAuthentication(unit: UnitView, event: H3Event, input: { challengeId: string, purpose: ChallengePurpose, response: AuthenticationResponseJSON }): Promise<{ accountId: string, passkeyId: string }> {
  const { challenge, accountId } = await spendChallenge(unit, input.challengeId, input.purpose)
  const passkey = await first<PasskeyRow>('SELECT * FROM core_passkeys WHERE credential_id = ?', input.response?.id)
  const failed: () => never = () => refuse('core.passkey.not-verified', 'That passkey could not be checked.', { status: 422, remedy: 'Try again, or sign in another way.' })
  if (!passkey || (accountId && passkey.account_id !== accountId)) failed()
  const rp = relyingParty(event)
  let result
  try {
    result = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: { id: passkey.credential_id, publicKey: fromBase64url(passkey.public_key), counter: passkey.sign_count, transports: passkey.transports ? JSON.parse(passkey.transports) : undefined },
    })
  }
  catch {
    failed()
  }
  if (!result.verified) failed()
  unit.add({ sql: 'UPDATE core_passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?', params: [result.authenticationInfo.newCounter, nowMs(), passkey.id] })
  return { accountId: passkey.account_id, passkeyId: passkey.id }
}

export async function passkeyCount(accountId: string): Promise<number> {
  return (await first<{ n: number }>('SELECT count(*) AS n FROM core_passkeys WHERE account_id = ?', accountId))?.n ?? 0
}

/**
 * A new set of recovery codes, replacing any old set (ID-14). Only their hashes are kept; the
 * codes themselves are returned once, to be shown once.
 */
export async function newRecoveryCodes(unit: UnitView, accountId: string): Promise<string[]> {
  const count = await useSetting('core.recovery.code-count') as number
  const codes = Array.from({ length: count }, () => randomRecoveryCode())
  unit.add({ sql: 'DELETE FROM core_recovery_codes WHERE account_id = ?', params: [accountId] })
  const at = nowMs()
  const params: unknown[] = []
  for (const code of codes) params.push(newId('rcc', { random: true }), accountId, await digest('recovery', code), at)
  unit.add({ sql: `INSERT INTO core_recovery_codes (id, account_id, code_hash, created_at) VALUES ${codes.map(() => '(?, ?, ?, ?)').join(', ')}`, params })
  return codes
}

/** Whether a typed code is one of the account's unused recovery codes. Spends nothing. */
export async function isRecoveryCode(accountId: string, typed: string): Promise<boolean> {
  const row = await first('SELECT 1 AS one FROM core_recovery_codes WHERE account_id = ? AND code_hash = ? AND used_at IS NULL', accountId, await digest('recovery', normaliseRecoveryCode(typed)))
  return !!row
}
