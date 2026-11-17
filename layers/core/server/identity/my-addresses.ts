// A person's own email addresses (ID-12; part 3, "An address"). An added address does nothing until
// its link is used, and is removed if it stays unverified too long. An address another account
// holds is never revealed: an unclaimed account's address can be added and verifying it merges that
// account in; a claimed account's verified address cannot, and the refusal says only how to ask for
// a merge.
import type { H3Event } from 'h3'
import { all, first, newId, nowMs, refuse, useSetting, siteUrl, type UnitView } from '#kit'
import { countAgainstRate } from '#kit/ratelimit'
import { accountById, addressRow, isUsable, normaliseAddress, type AccountRow, type AddressRow } from './accounts'
import { digest, randomToken } from './crypto'
import { mergeAccounts } from './merge'
import { queueNotice } from './notices'

export interface MyAddress { id: string, address: string, verified: boolean, audience: boolean, members: boolean }

export async function addressesOf(account: AccountRow): Promise<MyAddress[]> {
  const rows = await all<{ id: string, address: string, verified_at: number | null }>('SELECT id, address, verified_at FROM core_account_emails WHERE account_id = ? ORDER BY created_at', account.id)
  return rows.map(r => ({
    id: r.id,
    address: r.address,
    verified: r.verified_at !== null,
    audience: account.audience_email_id === r.id,
    // No members' address of its own means the audience address serves both sides.
    members: (account.members_email_id ?? account.audience_email_id) === r.id,
  }))
}

const UNAVAILABLE = { code: 'core.address.unavailable', reason: 'This address cannot be added to your account.', remedy: 'If it belongs to another account of yours, ask the theatre to merge the two.' }
const refuseUnavailable = (): never => refuse(UNAVAILABLE.code, UNAVAILABLE.reason, { status: 409, remedy: UNAVAILABLE.remedy })

/**
 * What adding an address already held by another account would do. An unclaimed, live account is
 * merged in once the address is verified. A claimed account's address is taken only while it is
 * unverified and not one that account writes to, so adding an address nobody has proved cannot hold
 * it back from its owner. Anything else is refused, the same way whatever the reason.
 */
async function claimOn(held: AddressRow): Promise<'merge' | 'take'> {
  const holder = await accountById(held.account_id)
  if (!isUsable(holder)) return refuseUnavailable()
  if (!holder.first_signed_in_at) return 'merge'
  const pointer = held.id === holder.audience_email_id || held.id === holder.members_email_id
  if (!held.verified_at && !pointer) return 'take'
  return refuseUnavailable()
}

/** Adds an address and sends its verification link. Nothing else is ever sent to it until it is verified. */
export async function addAddress(unit: UnitView, event: H3Event, accountId: string, typed: string): Promise<{ id: string | null }> {
  const address = normaliseAddress(typed)
  if (!(await countAgainstRate('sign-in', `address:${address}`)).allowed) refuse('core.rate-limited', 'Too many tries for this address.', { status: 429, remedy: 'Wait a while, then try again.' })
  const existing = await addressRow(address)
  let id: string | null = null
  if (existing?.account_id === accountId) {
    if (existing.verified_at) refuse('core.address.already-yours', 'This address is already on your account.', { status: 409 })
    id = existing.id // not verified yet: send its link again
  }
  else if (existing) {
    // Held elsewhere: nothing is written to the other account until the link is used.
    await claimOn(existing)
  }
  else {
    id = newId('aem')
    unit.add({ sql: 'INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, NULL, \'self\', ?)', params: [id, accountId, address, nowMs()] })
  }
  const token = randomToken()
  const at = nowMs()
  const lifetime = await useSetting('core.sign-in.unverified-address-lifetime') as number
  // A new link replaces one still waiting for the same address.
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE purpose = \'verify_address\' AND account_id = ? AND address = ? AND used_at IS NULL', params: [at, accountId, address] })
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, address, attempts, created_at, expires_at)
          VALUES (?, 'verify_address', ?, ?, ?, 0, ?, ?)`,
    params: [newId('tok', { random: true }), await digest('link', token), accountId, address, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  await queueNotice(unit, 'core.address-verify', [address], { link: await siteUrl(`/sign-in/verify-address#${token}`) })
  return { id }
}

const LINK_BAD = { code: 'core.address.link-unknown', reason: 'This link is not valid, or has been used or run out.', remedy: 'Add the address again to get a new link.' }
const refuseLink = (): never => refuse(LINK_BAD.code, LINK_BAD.reason, { status: 410, remedy: LINK_BAD.remedy })

/**
 * Uses a verification link. It proves the mailbox, so no session is needed. If the address is held
 * by an unclaimed account, that account is merged into the one that asked, as a claim; if it sits
 * unverified on a claimed account, it moves to the one that proved it.
 */
export async function verifyAddress(unit: UnitView, token: string): Promise<{ accountId: string }> {
  const at = nowMs()
  const row = await first<{ id: string, account_id: string | null, address: string | null, expires_at: number, used_at: number | null }>(
    'SELECT id, account_id, address, expires_at, used_at FROM core_account_tokens WHERE token_hash = ? AND purpose = \'verify_address\'', await digest('link', token),
  )
  if (!row?.account_id || !row.address || row.used_at || row.expires_at <= at) return refuseLink()
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL', params: [at, row.id] }).expect(1, LINK_BAD)
  const accountId = row.account_id
  if (!isUsable(await accountById(accountId))) return refuseLink()
  const held = await addressRow(row.address)
  let emailId: string
  if (held?.account_id === accountId) {
    emailId = held.id
    unit.add({ sql: 'UPDATE core_account_emails SET verified_at = ? WHERE id = ? AND verified_at IS NULL', params: [at, emailId] })
  }
  else if (held && (await claimOn(held)) === 'merge') {
    // The link may be used signed out; the claim is the person's own, so it is recorded as theirs.
    await mergeAccounts(unit, { kind: 'person', accountId }, { survivorId: accountId, mergedAccountId: held.account_id, startedBy: 'claim' })
    emailId = held.id // the merge moves the address with everything else
    unit.add({ sql: 'UPDATE core_account_emails SET verified_at = ? WHERE id = ? AND verified_at IS NULL', params: [at, emailId] })
  }
  else {
    // Taken from a claimed account that never proved it, or swept since the link was sent.
    if (held) unit.add({ sql: 'DELETE FROM core_account_emails WHERE id = ? AND verified_at IS NULL', params: [held.id] }).expect(1, UNAVAILABLE)
    emailId = newId('aem')
    unit.add({ sql: 'INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?)', params: [emailId, accountId, row.address, at, at] })
  }
  unit.announce('core.account-email.verified', { accountId, emailId }, { record: ['core.account', accountId] })
  unit.audit({ action: 'update', record: ['core.account', accountId], detail: { addressVerified: emailId } })
  return { accountId }
}

async function ownRow(accountId: string, id: string) {
  const row = await first<{ id: string, address: string, verified_at: number | null }>('SELECT id, address, verified_at FROM core_account_emails WHERE id = ? AND account_id = ?', id, accountId)
  return row ?? refuse('core.not-found', 'There is no such address on your account.', { status: 404 })
}

/** Makes a verified address the one a side writes to, and tells the address it replaces. */
export async function useAddressFor(unit: UnitView, account: AccountRow, id: string, side: 'audience' | 'members'): Promise<void> {
  const row = await ownRow(account.id, id)
  if (!row.verified_at) refuse('core.address.unverified', 'Confirm this address first.', { status: 409, remedy: 'Use the link we sent to it.' })
  const column = side === 'audience' ? 'audience_email_id' : 'members_email_id'
  const currentId = side === 'audience' ? account.audience_email_id : account.members_email_id ?? account.audience_email_id
  if (currentId === id) return
  unit.add({ sql: `UPDATE core_accounts SET ${column} = ? WHERE id = ?`, params: [id, account.id] })
  const old = currentId ? await first<{ address: string }>('SELECT address FROM core_account_emails WHERE id = ?', currentId) : null
  if (old) await queueNotice(unit, side === 'audience' ? 'core.address-changed' : 'core.members-address-changed', [old.address])
  unit.audit({ action: 'update', record: ['core.account', account.id], detail: { side, emailId: id } })
}

/** Removes an address: never the audience address, and never the last verified one. */
export async function removeAddress(unit: UnitView, account: AccountRow, id: string): Promise<void> {
  const row = await ownRow(account.id, id)
  if (account.audience_email_id === id) refuse('core.address.in-use', 'This is the address the theatre writes to.', { status: 409, remedy: 'Choose another address for that first.' })
  if (row.verified_at) {
    const [count] = await all<{ n: number }>('SELECT count(*) AS n FROM core_account_emails WHERE account_id = ? AND verified_at IS NOT NULL', account.id)
    if ((count?.n ?? 0) <= 1) refuse('core.address.last', 'This is the last confirmed address on your account.', { status: 409, remedy: 'Add and confirm another address first.' })
  }
  if (account.members_email_id === id) unit.add({ sql: 'UPDATE core_accounts SET members_email_id = NULL WHERE id = ?', params: [account.id] })
  unit.add({ sql: 'DELETE FROM core_account_emails WHERE id = ? AND account_id = ?', params: [id, account.id] }).expect(1)
  // A link still waiting for the removed address must not bring it back.
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE purpose = \'verify_address\' AND account_id = ? AND address = ? AND used_at IS NULL', params: [nowMs(), account.id, row.address] })
  if (row.verified_at) await queueNotice(unit, 'core.address-changed', [row.address])
  unit.audit({ action: 'delete', record: ['core.account', account.id], detail: { emailId: id } })
}

/**
 * The sweep's part (ID-12): an address a person added and never verified goes after
 * core.sign-in.unverified-address-lifetime. The address an unclaimed account was made with is not
 * one the person added, and stays.
 */
export async function sweepUnverifiedAddresses(unit: UnitView): Promise<void> {
  const lifetime = await useSetting('core.sign-in.unverified-address-lifetime') as number
  unit.add({
    sql: `DELETE FROM core_account_emails WHERE verified_at IS NULL AND added_by = 'self' AND created_at <= ?
            AND account_id IN (SELECT id FROM core_accounts WHERE first_signed_in_at IS NOT NULL)`,
    params: [nowMs() - lifetime * 1000], // not-policy: seconds to milliseconds
  })
}
