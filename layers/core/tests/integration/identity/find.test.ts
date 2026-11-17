// findAccounts (Identity Doc part 4, "Finding rows by a person's name or email"): a subquery of
// account ids for another module's list, by the list search rules, on identity's search indexes.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createUnit, newId, useDb, type Actor } from '#kit'
import { findAccounts } from '../../../server/identity/find'
import { env, grantDirectly, leaveIdentity, reset, staff, unclaimedAccount, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

const list = 'core.accounts'

async function person(name: string, extra: { preferred?: string, address?: string, verified?: boolean, disabled?: boolean } = {}): Promise<string> {
  const id = newId('acc')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO core_accounts (id, name, preferred_name, origin, created_at, first_signed_in_at, disabled_at) VALUES (?, ?, ?, \'self\', ?, ?, ?)')
    .bind(id, name, extra.preferred ?? null, at, at, extra.disabled ? at : null).run()
  if (extra.address) {
    await env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?)')
      .bind(newId('aem'), id, extra.address, extra.verified === false ? null : at, at).run()
  }
  return id
}

async function finder(): Promise<Actor> {
  const { accountId } = await staff()
  await grantDirectly(accountId, ['core.account.find'])
  return { kind: 'person', accountId, assurance: 'basic' }
}

async function find(actor: Actor, text: string): Promise<string[]> {
  return inContext(async () => {
    const unit = createUnit()
    const ids = await findAccounts(unit.view(), actor, text, list)
    await unit.commit()
    return (await useDb().all<{ id: string }>(sql`SELECT id FROM core_accounts WHERE id IN (${ids}) ORDER BY id`)).map(r => r.id)
  }, actor)
}

describe('findAccounts', () => {
  it('finds by every word in the name or the name the person goes by, folding accents, with no ranking', async () => {
    const actor = await finder()
    const zoe = await person('Zoë Quartermaine')
    const known = await person('Robert Quartermaine', { preferred: 'Bobbie' })
    await person('Someone Else')
    expect(await find(actor, 'zoe quarter')).toEqual([zoe])
    expect(await find(actor, 'QUARTERMAINE')).toEqual([zoe, known].sort())
    expect(await find(actor, 'bobbie')).toEqual([known])
    // Every word must match.
    expect(await find(actor, 'zoe bobbie')).toEqual([])
    // Words under three letters cannot use the index and match nobody alone.
    expect(await find(actor, 'zo')).toEqual([])
  })

  it('finds by a verified address, never an unverified one', async () => {
    const actor = await finder()
    const verified = await person('Vera Verified', { address: 'vera.findable@example.org' })
    await person('Una Unverified', { address: 'una.findable@example.org', verified: false })
    expect(await find(actor, 'findable@example')).toEqual([verified])
  })

  it('finds unclaimed and disabled accounts, a merged-away one as its survivor with every alias, and never a tombstone', async () => {
    const actor = await finder()
    const guest = await unclaimedAccount()
    await env.DB.prepare('UPDATE core_accounts SET name = \'Gail Guestfindable\' WHERE id = ?').bind(guest).run()
    const disabled = await person('Dora Findable', { disabled: true })
    const survivor = await person('Sam Survivor')
    const merged = await person('Mergedfindable Person')
    await env.DB.prepare('UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ?').bind(survivor, Date.now(), merged).run()
    const tomb = await person('Tomb Findable')
    await env.DB.prepare('UPDATE core_accounts SET anonymised_at = ? WHERE id = ?').bind(Date.now(), tomb).run()

    expect(await find(actor, 'guestfindable')).toEqual([guest])
    expect(await find(actor, 'dora findable')).toEqual([disabled])
    // A row still naming the merged-away account is found through the alias, with the survivor.
    expect(await find(actor, 'mergedfindable')).toEqual([survivor, merged].sort())
    expect(await find(actor, 'tomb findable')).toEqual([])
  })

  it('sees a name change at once, and an erased name is gone from the index', async () => {
    const actor = await finder()
    const id = await person('Changeable Name')
    await env.DB.prepare('UPDATE core_accounts SET name = \'Renamed Person\' WHERE id = ?').bind(id).run()
    expect(await find(actor, 'changeable')).toEqual([])
    expect(await find(actor, 'renamed')).toEqual([id])
    await env.DB.prepare('UPDATE core_accounts SET name = NULL WHERE id = ?').bind(id).run()
    expect(await find(actor, 'renamed')).toEqual([])
  })

  it('refuses without the ability, and audits each use with the list but never the words', async () => {
    const { accountId } = await staff()
    const outsider: Actor = { kind: 'person', accountId, assurance: 'basic' }
    await expect(find(outsider, 'anybody')).rejects.toMatchObject({ code: expect.stringMatching(/^core\.access\./) })

    const actor = await finder()
    await expect(inContext(() => findAccounts(createUnit().view(), actor, 'anybody', 'seats.no-such-list'), actor)).rejects.toThrow(/no module declares/)
    await find(actor, 'secretword')
    const entries = await rows<{ action: string, ability: string, detail: string }>('SELECT action, ability, detail FROM core_audit WHERE actor_account_id = ? AND ability = \'core.account.find\'', actor.accountId)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'read' })
    expect(JSON.parse(entries[0]!.detail)).toEqual({ list: 'core.accounts' })
    expect(await rows('SELECT count(*) AS n FROM core_audit WHERE detail LIKE \'%secretword%\'')).toEqual([{ n: 0 }])
  })

  it('comes with the person picker\'s ability', async () => {
    const { accountId } = await staff()
    await grantDirectly(accountId, ['core.account.search'])
    const id = await person('Pickable Person')
    expect(await find({ kind: 'person', accountId, assurance: 'basic' }, 'pickable')).toEqual([id])
  })
})
