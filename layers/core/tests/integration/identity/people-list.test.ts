// The console's Accounts list (Identity Doc part 5): everyone, searched through findAccounts and
// filtered by state; unclaimed and erased accounts hidden unless looked for, with a count of them.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { env, grantDirectly, leaveIdentity, reset, staff, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

type State = 'active' | 'unclaimed' | 'disabled' | 'anonymised'

async function person(name: string, state: State, address?: string): Promise<string> {
  const id = newId('acc')
  const at = Date.now()
  const signedIn = state === 'unclaimed' ? null : at
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at, disabled_at, anonymised_at) VALUES (?, ?, \'self\', ?, ?, ?, ?)')
    .bind(id, state === 'anonymised' ? null : name, at, signedIn, state === 'disabled' ? at : null, state === 'anonymised' ? at : null).run()
  if (address) await env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?)').bind(newId('aem'), id, address, at, at).run()
  return id
}

async function reader() {
  const { browser, accountId } = await staff()
  await grantDirectly(accountId, ['core.account.read'])
  return { browser, accountId }
}

describe('the Accounts list', () => {
  it('shows active and disabled people by default, says how many it hides, and finds by a verified address', async () => {
    const { browser, accountId } = await reader()
    const word = `Zephyrine${crypto.randomUUID().slice(0, 6)}`
    const active = await person(`Ada ${word}`, 'active', `${word.toLowerCase()}@example.org`)
    const disabled = await person(`Dot ${word}`, 'disabled')
    const unclaimed = await person(`Una ${word}`, 'unclaimed')
    const merged = await person(`Max ${word}`, 'active')
    await env.DB.prepare('UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ?').bind(active, Date.now(), merged).run()

    const shown = await browser.get(`/api/core/people?q=${word}`)
    expect(shown.status).toBe(200)
    expect(shown.body.rows.map((r: any) => r.id)).toEqual([active, disabled])
    expect(shown.body.rows.map((r: any) => r.state)).toEqual(['active', 'disabled'])
    expect(shown.body).toMatchObject({ total: 2, hidden: { unclaimed: 1 } })

    const looked = await browser.get(`/api/core/people?q=${word}&view=unclaimed`)
    expect(looked.body.rows.map((r: any) => r.id)).toEqual([unclaimed])
    expect(looked.body.hidden).toEqual({})

    const everyone = await browser.get(`/api/core/people?q=${word}&view=all`)
    expect(everyone.body.rows.map((r: any) => r.id).sort()).toEqual([active, disabled, unclaimed].sort())

    // An address finds its person; the merged-away account is never a row of its own.
    const byAddress = await browser.get(`/api/core/people?q=${word.toLowerCase()}@example`)
    expect(byAddress.body.rows.map((r: any) => r.id)).toEqual([active])

    // Each read is audited, and what was typed is not.
    const audited = await rows<{ detail: string }>('SELECT detail FROM core_audit WHERE actor_account_id = ? AND ability = \'core.account.read\'', accountId)
    expect(audited.length).toBeGreaterThan(0)
    expect(audited.every(a => JSON.parse(a.detail).list === 'core.accounts')).toBe(true)
    expect(await rows(`SELECT count(*) AS n FROM core_audit WHERE detail LIKE '%${word}%'`)).toEqual([{ n: 0 }])
  })

  it('shows erased accounts only when asked for, and too short a search narrows nothing', async () => {
    const { browser } = await reader()
    const erased = await person('', 'anonymised')
    const listed = await browser.get('/api/core/people?state=anonymised&size=100')
    expect(listed.body.rows.some((r: any) => r.id === erased && r.state === 'anonymised' && r.name === null)).toBe(true)
    const byDefault = await browser.get('/api/core/people?size=100')
    expect(byDefault.body.rows.some((r: any) => r.id === erased)).toBe(false)
    expect(byDefault.body.hidden.anonymised).toBeGreaterThan(0)

    const short = await browser.get('/api/core/people?q=ab')
    expect(short.body).toMatchObject({ searchTooShort: true, ignoredWords: ['ab'] })
  })

  it('refuses a person without core.account.read, and a filter value it does not know', async () => {
    const { browser } = await staff()
    expect((await browser.get('/api/core/people')).status).toBe(403)
    const { browser: allowed } = await reader()
    expect((await allowed.get('/api/core/people?state=lost')).status).toBe(422)
  })
})
