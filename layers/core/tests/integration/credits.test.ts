// C-09, credits: a credit has a section, a role and a printed name, and may link to an account.
// Credits are reordered within a section. A hidden credit appears on no public route. The linked
// person is told, may change who sees their own credit with no ability, holds core.production-team
// while the production is current, and keeps the printed name on erasure with the link gone.
import { beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../server/api/core/productions/index.post'
import listCredits from '../../server/api/core/productions/[id]/credits/index.get'
import addCredit from '../../server/api/core/productions/[id]/credits/index.post'
import orderCredits from '../../server/api/core/productions/[id]/credits/order.put'
import patchCredit from '../../server/api/core/productions/[id]/credits/[credit]/index.patch'
import deleteCredit from '../../server/api/core/productions/[id]/credits/[credit]/index.delete'
import myCredits from '../../server/api/core/me/credits.get'
import setMine from '../../server/api/core/me/credits/[credit].patch'
import eraseCredits from '../../server/contributions/core.erasure-handler/credits'
import { listTerms } from '../../server/vocabularies/service'
import { myCreditCount, onProductionTeam, productionTeamHolders, shownCredits } from '../../server/programme/credits'
import { createUnit, factHolders, newId } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'GET /api/core/productions/:id/credits': listCredits,
  'POST /api/core/productions/:id/credits': addCredit,
  'PUT /api/core/productions/:id/credits/order': orderCredits,
  'PATCH /api/core/productions/:id/credits/:credit': patchCredit,
  'DELETE /api/core/productions/:id/credits/:credit': deleteCredit,
  'GET /api/core/me/credits': myCredits,
  'PATCH /api/core/me/credits/:credit': setMine,
})
const editor = person(['core.production.create', 'core.production.edit', 'core.production.view'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
// Over https, as the site is served: the message's link must be an https address.
const req = (method: string, path: string, body?: object, actor = editor) => json(handle(new Request(`https://test${path}`, {
  method,
  headers: { 'content-type': 'application/json', 'host': 'test', 'x-test-actor': JSON.stringify(actor) },
  body: body === undefined ? undefined : JSON.stringify(body),
})))
// A vocabulary is made with its starting terms the first time anything reads it.
const section = async (slug: string) =>
  (await inContext(() => listTerms('core.credit-section'))).find(t => t.slug === slug)!.id

async function account(name: string): Promise<string> {
  const id = newId('acc')
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, ?, \'staff\', ?)').bind(id, name, Date.now()).run()
  return id
}
const as = (accountId: string) => person([], { accountId })

let n = 0
async function production(): Promise<string> {
  const { status, body } = await req('POST', '/api/core/productions', { title: `Credited ${++n}`, kind: 'own' })
  expect(status).toBe(200)
  return body.id
}
async function credit(productionId: string, values: object): Promise<string> {
  const { status, body } = await req('POST', `/api/core/productions/${productionId}/credits`, values)
  expect(status, JSON.stringify(body)).toBe(200)
  return body.id
}
const told = (accountId: string) => rows('SELECT id FROM core_notifications WHERE type_key = \'core.credit.added\' AND account_id = ?', accountId)

beforeEach(() => resetRateLimits())

describe('credits on a production (C-09)', () => {
  it('lists credits by section in the vocabulary\'s order, each added at the end of its section', async () => {
    const p = await production()
    const [cast, crew] = [await section('cast'), await section('crew')]
    await credit(p, { creditedName: 'Sam Lighting', role: 'Lighting operator', sectionTermId: crew })
    await credit(p, { creditedName: 'Ada Lane', role: 'Hamlet', sectionTermId: cast })
    await credit(p, { creditedName: 'Ben Holt', role: 'Ophelia', sectionTermId: cast })
    const { body } = await req('GET', `/api/core/productions/${p}/credits`)
    expect(body.credits.map((c: any) => [c.creditedName, c.sort])).toEqual([['Ada Lane', 0], ['Ben Holt', 1], ['Sam Lighting', 0]])
    expect(body.sections.map((s: any) => s.label)).toContain('Cast')
  })

  it('refuses a section from another vocabulary, a name over 120 characters, and a person who cannot be credited', async () => {
    const p = await production()
    const advisory = (await inContext(() => listTerms('core.advisory')))[0]!.id
    expect((await req('POST', `/api/core/productions/${p}/credits`, { creditedName: 'X', role: 'Y', sectionTermId: advisory })).body.code).toBe('core.credit.section-unknown')
    expect((await req('POST', `/api/core/productions/${p}/credits`, { creditedName: 'x'.repeat(121), role: 'Y', sectionTermId: await section('cast') })).status).toBe(422)
    expect((await req('POST', `/api/core/productions/${p}/credits`, { creditedName: 'X', role: 'Y', sectionTermId: await section('cast'), accountId: 'acc_nobody' })).body.code).toBe('core.credit.account-unknown')
    expect(await rows('SELECT id FROM core_production_credits WHERE production_id = ?', p)).toEqual([])
  })

  it('reorders a section only when the list names every credit in it once', async () => {
    const p = await production()
    const cast = await section('cast')
    const a = await credit(p, { creditedName: 'A', role: 'One', sectionTermId: cast })
    const b = await credit(p, { creditedName: 'B', role: 'Two', sectionTermId: cast })
    const c = await credit(p, { creditedName: 'C', role: 'Three', sectionTermId: cast })
    expect((await req('PUT', `/api/core/productions/${p}/credits/order`, { sectionTermId: cast, ids: [c, a] })).status).toBe(409)
    expect((await req('PUT', `/api/core/productions/${p}/credits/order`, { sectionTermId: cast, ids: [c, a, a] })).status).toBe(409)
    expect((await req('PUT', `/api/core/productions/${p}/credits/order`, { sectionTermId: cast, ids: [c, a, b] })).status).toBe(200)
    expect((await req('GET', `/api/core/productions/${p}/credits`)).body.credits.map((x: any) => x.creditedName)).toEqual(['C', 'A', 'B'])
  })

  it('moves an edited credit to the end of its new section, and removes one', async () => {
    const p = await production()
    const [cast, band] = [await section('cast'), await section('band')]
    const a = await credit(p, { creditedName: 'A', role: 'Keys', sectionTermId: band })
    const b = await credit(p, { creditedName: 'B', role: 'Chorus', sectionTermId: cast })
    expect((await req('PATCH', `/api/core/productions/${p}/credits/${b}`, { sectionTermId: band, role: 'Drums' })).status).toBe(200)
    expect(await rows('SELECT credited_name, role, sort FROM core_production_credits WHERE id = ?', b)).toEqual([{ credited_name: 'B', role: 'Drums', sort: 1 }])
    expect((await req('DELETE', `/api/core/productions/${p}/credits/${a}`, {})).status).toBe(200)
    expect((await req('DELETE', `/api/core/productions/${p}/credits/${a}`, {})).status).toBe(404)
    // A credit is found only through its own production.
    expect((await req('PATCH', `/api/core/productions/${await production()}/credits/${b}`, { role: 'Bass' })).status).toBe(404)
  })

  it('tells a linked person once, and tells a newly linked person', async () => {
    const p = await production()
    const [ada, ben] = [await account('Ada Lane'), await account('Ben Holt')]
    const id = await credit(p, { creditedName: 'Ada Lane', role: 'Hamlet', sectionTermId: await section('cast'), accountId: ada })
    expect(await told(ada)).toHaveLength(1)
    await req('PATCH', `/api/core/productions/${p}/credits/${id}`, { role: 'Hamlet, Prince of Denmark' })
    expect(await told(ada)).toHaveLength(1)
    await req('PATCH', `/api/core/productions/${p}/credits/${id}`, { accountId: ben, creditedName: 'Ben Holt' })
    expect(await told(ben)).toHaveLength(1)
  })
})

describe('the linked person\'s own credit', () => {
  it('lets them choose who sees it, with no ability, and nobody else', async () => {
    const p = await production()
    const ada = await account('Ada Lane')
    const id = await credit(p, { creditedName: 'Ada Lane', role: 'Hamlet', sectionTermId: await section('cast'), accountId: ada })
    const mine = await req('GET', '/api/core/me/credits', undefined, as(ada))
    expect(mine.body.credits).toEqual([expect.objectContaining({ id, production: expect.stringMatching(/^Credited/), role: 'Hamlet', section: 'Cast', visibility: 'public' })])
    expect((await req('PATCH', `/api/core/me/credits/${id}`, { visibility: 'hidden' }, as(ada))).status).toBe(200)
    // Only the visibility can change this way.
    expect((await req('PATCH', `/api/core/me/credits/${id}`, { visibility: 'public', role: 'King' }, as(ada))).status).toBe(200)
    expect(await rows('SELECT role, visibility FROM core_production_credits WHERE id = ?', id)).toEqual([{ role: 'Hamlet', visibility: 'public' }])
    // Someone else's credit is not found.
    expect((await req('PATCH', `/api/core/me/credits/${id}`, { visibility: 'hidden' }, as(await account('Someone Else')))).status).toBe(404)
  })

  it('follows a merge: the survivor sees and changes a credit linked to the merged-away account', async () => {
    const p = await production()
    const [survivor, merged] = [await account('Ada Lane'), await account('A. Lane')]
    const id = await credit(p, { creditedName: 'Ada Lane', role: 'Hamlet', sectionTermId: await section('cast'), accountId: merged })
    await env.DB.prepare('UPDATE core_accounts SET merged_into_id = ? WHERE id = ?').bind(survivor, merged).run()
    expect(await inContext(() => myCreditCount(survivor))).toBe(1)
    expect((await req('PATCH', `/api/core/me/credits/${id}`, { visibility: 'members' }, as(survivor))).status).toBe(200)
    expect((await req('GET', `/api/core/productions/${p}/credits`)).body.credits[0].accountLabel).toBe('Ada Lane')
  })
})

describe('who sees a credit', () => {
  it('shows public credits on a published production, members-only ones on the members\' side, and hidden ones nowhere', async () => {
    const p = await production()
    const cast = await section('cast')
    await credit(p, { creditedName: 'Open', role: 'One', sectionTermId: cast })
    await credit(p, { creditedName: 'Members', role: 'Two', sectionTermId: cast, visibility: 'members' })
    await credit(p, { creditedName: 'Hidden', role: 'Three', sectionTermId: cast, visibility: 'hidden' })
    const names = async (members: boolean) => (await inContext(() => shownCredits(p, members))).map(c => c.creditedName)
    // A draft shows nothing.
    expect(await names(true)).toEqual([])
    await env.DB.prepare('UPDATE core_productions SET state = \'published\' WHERE id = ?').bind(p).run()
    expect(await names(false)).toEqual(['Open'])
    expect(await names(true)).toEqual(['Open', 'Members'])
    // With the production's credits not public, none show at all.
    await env.DB.prepare('UPDATE core_productions SET credits_public = 0 WHERE id = ?').bind(p).run()
    expect(await names(true)).toEqual([])
  })
})

describe('core.production-team', () => {
  it('holds from linking until the standing has passed since the last performance ended', async () => {
    const p = await production()
    const ada = await account('Ada Lane')
    const team = () => inContext(() => onProductionTeam(ada, p))
    expect(await team()).toEqual({ holds: false })
    await credit(p, { creditedName: 'Ada Lane', role: 'Hamlet', sectionTermId: await section('cast'), accountId: ada })
    // No performances yet: current, with no end.
    expect(await team()).toEqual({ holds: true })
    expect(await inContext(() => productionTeamHolders(p))).toEqual([ada])
    const day = 86_400_000
    await env.DB.prepare('UPDATE core_productions SET last_ends_at = ? WHERE id = ?').bind(Date.now() - day, p).run()
    const within = await team()
    expect(within.holds).toBe(true)
    expect(within.until).toBeGreaterThan(Date.now())
    // The default standing is 30 days.
    await env.DB.prepare('UPDATE core_productions SET last_ends_at = ? WHERE id = ?').bind(Date.now() - 31 * day, p).run()
    expect(await team()).toEqual({ holds: false })
    expect(await inContext(() => factHolders('core.production-team', ['core.production', p]))).toEqual([])
  })
})

describe('erasure', () => {
  it('clears the link and keeps the printed name, as a printed programme would', async () => {
    const p = await production()
    const ada = await account('Ada Lane')
    const id = await credit(p, { creditedName: 'Ada Lane', role: 'Hamlet', sectionTermId: await section('cast'), accountId: ada })
    await inContext(async () => {
      const unit = createUnit()
      await eraseCredits.erase(unit.view(), { accountId: ada, emails: [] })
      await unit.commit()
    })
    expect(await rows('SELECT account_id, credited_name, role FROM core_production_credits WHERE id = ?', id)).toEqual([{ account_id: null, credited_name: 'Ada Lane', role: 'Hamlet' }])
  })
})
