// The address each side writes to (identity part 4): addressFor and its set form addressesFor,
// which notifications use to resolve a whole list of recipients in one query.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { Browser, address, env, leaveIdentity, reset, signInByEmail, unclaimedAccount, useIdentity } from './helpers'
import { inContext } from '../../../../../tests/integration/helpers'
import { addressFor, addressesFor } from '../../../server/identity/addresses'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

/** Adds an address to an account, verified or not, and makes it the members' address. */
async function membersAddress(accountId: string, to: string, verified: boolean): Promise<void> {
  const id = newId('aem')
  await env.DB.batch([
    env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?)').bind(id, accountId, to, verified ? Date.now() : null, Date.now()),
    env.DB.prepare('UPDATE core_accounts SET members_email_id = ? WHERE id = ?').bind(id, accountId),
  ])
}

describe('addressFor', () => {
  it('gives a claimed account its verified audience address on both sides until it chooses a members\' address', async () => {
    const to = address()
    const accountId = await signInByEmail(new Browser(), to)
    expect(await inContext(() => addressFor(accountId, 'audience'))).toBe(to)
    expect(await inContext(() => addressFor(accountId, 'members'))).toBe(to)
    const work = address()
    await membersAddress(accountId, work, true)
    expect(await inContext(() => addressFor(accountId, 'members'))).toBe(work)
    expect(await inContext(() => addressFor(accountId, 'audience'))).toBe(to)
  })

  it('never writes to a members\' address the person has not verified', async () => {
    const to = address()
    const accountId = await signInByEmail(new Browser(), to)
    await membersAddress(accountId, address(), false)
    expect(await inContext(() => addressFor(accountId, 'members'))).toBe(to)
  })

  it('writes to an unclaimed account at the address it was made with', async () => {
    const to = address()
    const accountId = await unclaimedAccount(to)
    expect(await inContext(() => addressFor(accountId, 'audience'))).toBe(to)
    expect(await inContext(() => addressFor(accountId, 'members'))).toBe(to)
  })

  it('gives nothing for a disabled account, an alias, a tombstone or an unknown id', async () => {
    const [disabled, alias, tombstone] = await Promise.all([1, 2, 3].map(() => signInByEmail(new Browser())))
    await env.DB.batch([
      env.DB.prepare('UPDATE core_accounts SET disabled_at = ?, disabled_reason = \'security\' WHERE id = ?').bind(Date.now(), disabled),
      env.DB.prepare('UPDATE core_accounts SET merged_into_id = ? WHERE id = ?').bind(disabled, alias),
      env.DB.prepare('UPDATE core_accounts SET anonymised_at = ? WHERE id = ?').bind(Date.now(), tombstone),
    ])
    for (const id of [disabled!, alias!, tombstone!, 'acc_nobody']) expect(await inContext(() => addressFor(id, 'audience'))).toBeNull()
  })
})

describe('addressesFor', () => {
  it('answers every id it was given, once each, across more ids than one statement can bind', async () => {
    const known = [] as Array<{ id: string, to: string }>
    for (let i = 0; i < 3; i++) {
      const to = address()
      known.push({ id: await unclaimedAccount(to), to })
    }
    const unknown = Array.from({ length: 120 }, (_, i) => `acc_missing${i}`)
    const ids = [...unknown.slice(0, 60), ...known.map(k => k.id), known[0]!.id, ...unknown.slice(60)]
    const found = await inContext(() => addressesFor(ids, 'audience'))
    expect(found.size).toBe(123)
    for (const k of known) expect(found.get(k.id)).toBe(k.to)
    expect(unknown.every(id => found.get(id) === null)).toBe(true)
  })
})
