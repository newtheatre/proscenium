// C-20 and C-21, and the test plan's vocabulary cases: the retired term, the renamed term and the
// duplicate label; plus locked vocabularies, reordering, deleting and the year end.
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import listVocabularies from '../../server/api/core/vocabularies/index.get'
import createVocabulary from '../../server/api/core/vocabularies/index.post'
import getVocabulary from '../../server/api/core/vocabularies/[key]/index.get'
import pickTerms from '../../server/api/core/vocabularies/[key]/terms/index.get'
import addTerm from '../../server/api/core/vocabularies/[key]/terms/index.post'
import patchTerm from '../../server/api/core/vocabularies/[key]/terms/[id]/index.patch'
import deleteTerm from '../../server/api/core/vocabularies/[key]/terms/[id]/index.delete'
import retireTerm from '../../server/api/core/vocabularies/[key]/terms/[id]/retire.post'
import restoreTerm from '../../server/api/core/vocabularies/[key]/terms/[id]/restore.post'
import reorder from '../../server/api/core/vocabularies/[key]/order.put'
import { assertTerm, getTerm } from '../../server/services'
import { changeSetting, createUnit, isRefusal } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, performance, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/vocabularies': listVocabularies,
  'POST /api/core/vocabularies': createVocabulary,
  'GET /api/core/vocabularies/:key': getVocabulary,
  'GET /api/core/vocabularies/:key/terms': pickTerms,
  'POST /api/core/vocabularies/:key/terms': addTerm,
  'PATCH /api/core/vocabularies/:key/terms/:id': patchTerm,
  'DELETE /api/core/vocabularies/:key/terms/:id': deleteTerm,
  'POST /api/core/vocabularies/:key/terms/:id/retire': retireTerm,
  'POST /api/core/vocabularies/:key/terms/:id/restore': restoreTerm,
  'PUT /api/core/vocabularies/:key/order': reorder,
})
const admin = person(['core.vocabulary.manage'])
const member = person([])
const CATEGORY = '/api/core/vocabularies/core.production-category'

interface TermBody { id: string, slug: string, label: string, retired: boolean, seeded: boolean, uses: number, mergedIntoId: string | null }

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}

async function terms(key = 'core.production-category'): Promise<TermBody[]> {
  return (await json<{ terms: TermBody[] }>(call(handle, 'GET', `/api/core/vocabularies/${key}`, { actor: admin }))).body.terms
}

async function termNamed(label: string, key?: string): Promise<TermBody> {
  const found = (await terms(key)).find(t => t.label === label)
  if (!found) throw new Error(`no term ${label}`)
  return found
}

async function add(label: string, key = 'core.production-category') {
  return json(call(handle, 'POST', `/api/core/vocabularies/${key}/terms`, { actor: admin, body: { label } }))
}

async function picker(key = 'core.production-category'): Promise<string[]> {
  return (await json<{ terms: { label: string }[] }>(call(handle, 'GET', `/api/core/vocabularies/${key}/terms`, { actor: member }))).body.terms.map(t => t.label)
}

async function usedBy(termId: string): Promise<string> {
  const id = await performance()
  await env.DB.prepare('UPDATE seats_performances SET category_id = ? WHERE id = ?').bind(termId, id).run()
  return id
}

beforeEach(() => {
  resetRateLimits()
})

describe('vocabularies core ships', () => {
  it('are made with their starting terms the first time anything reads them', async () => {
    const { status, body } = await json(call(handle, 'GET', '/api/core/vocabularies?size=100', { actor: admin }))
    expect(status).toBe(200)
    const keys = body.rows.map((v: { key: string }) => v.key)
    expect(keys).toEqual(expect.arrayContaining(['core.production-category', 'core.credit-section', 'core.advisory', 'core.access-feature', 'core.space-kind', 'core.place-access', 'core.cancel-reason']))
    const list = await terms()
    expect(list.slice(0, 3).map(t => t.label)).toEqual(['Play', 'Musical', 'Comedy'])
    expect(list.every(t => t.seeded)).toBe(true)
    const placeAccess = await terms('core.place-access')
    expect(placeAccess.find(t => t.slug === 'step-free')).toMatchObject({ label: 'Step-free access' })
  })

  it('needs the ability to edit, but any signed-in person can read a picker', async () => {
    expect((await call(handle, 'GET', CATEGORY, { actor: member })).status).toBe(403)
    expect((await call(handle, 'POST', `${CATEGORY}/terms`, { actor: member, body: { label: 'Opera' } })).status).toBe(403)
    expect(await picker()).toContain('Play')
    expect((await call(handle, 'GET', `${CATEGORY}/terms`)).status).toBe(401)
  })

  it('lets a grant on one vocabulary edit that vocabulary only', async () => {
    const manager = person([], { grants: [{ ability: 'core.vocabulary.manage', via: 'grant', record: { type: 'core.vocabulary', id: 'core.advisory' } }] } as any)
    expect((await call(handle, 'POST', '/api/core/vocabularies/core.advisory/terms', { actor: manager, body: { label: 'Puppetry' } })).status).toBe(200)
    expect((await call(handle, 'POST', `${CATEGORY}/terms`, { actor: manager, body: { label: 'Puppetry' } })).status).toBe(403)
  })
})

describe('the duplicate label', () => {
  it('refuses "comedy" while "Comedy" is live, and allows it once "Comedy" is retired', async () => {
    const refused = await add('comedy')
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.term.label-taken')

    const comedy = await termNamed('Comedy')
    expect((await call(handle, 'POST', `${CATEGORY}/terms/${comedy.id}/retire`, { actor: admin, body: {} })).status).toBe(200)
    const allowed = await add('comedy')
    expect(allowed.status).toBe(200)
    const made = (await terms()).find(t => t.id === allowed.body.id)!
    expect(made).toMatchObject({ label: 'comedy', slug: 'comedy-2', seeded: false, retired: false })

    // The old one cannot come back while the new one holds its name.
    const back = await json(call(handle, 'POST', `${CATEGORY}/terms/${comedy.id}/restore`, { actor: admin, body: {} }))
    expect(back.body.code).toBe('core.term.label-taken')

    // Renaming into a live label is refused the same way.
    const play = await termNamed('Play')
    const rename = await json(call(handle, 'PATCH', `${CATEGORY}/terms/${play.id}`, { actor: admin, body: { label: 'MUSICAL' } }))
    expect(rename.body.code).toBe('core.term.label-taken')
  })
})

describe('the retired term', () => {
  it('stays on the record, leaves every picker and cannot be deleted', async () => {
    const dance = await termNamed('Dance')
    const production = await usedBy(dance.id)
    expect((await call(handle, 'POST', `${CATEGORY}/terms/${dance.id}/retire`, { actor: admin, body: {} })).status).toBe(200)

    const [row] = await rows<{ category_id: string }>('SELECT category_id FROM seats_performances WHERE id = ?', production)
    expect(row!.category_id).toBe(dance.id)
    expect(await inContext(() => getTerm(dance.id))).toMatchObject({ label: 'Dance', retired: true })
    expect(await picker()).not.toContain('Dance')
    expect((await termNamed('Dance')).uses).toBe(1)

    // A new record cannot pick it: assertTerm guards the caller's own write.
    const guarded = await inContext(async () => {
      const unit = createUnit()
      unit.add(sql`UPDATE seats_performances SET category_id = ${dance.id} WHERE id = ${production} AND ${assertTerm(dance.id, 'core.production-category')}`).expect(1, { code: 'test.term-retired', reason: 'retired' })
      return unit.commit().then(() => 'saved', e => (isRefusal(e) ? e.code : 'other'))
    })
    expect(guarded).toBe('test.term-retired')

    const deleted = await json(call(handle, 'DELETE', `${CATEGORY}/terms/${dance.id}`, { actor: admin }))
    expect(deleted.status).toBe(409)
    expect(deleted.body.code).toBe('core.term.seeded')
  })

  it('refuses deleting a theatre term in use, and deletes one nothing ever used', async () => {
    const { body: { key } } = await json(call(handle, 'POST', '/api/core/vocabularies', { actor: admin, body: { label: 'Seasons' } }))
    expect(key).toBe('x.seasons')
    const spring = (await add('Spring', key)).body.id as string
    const summer = (await add('Summer', key)).body.id as string
    await usedBy(spring)

    const inUse = await json(call(handle, 'DELETE', `/api/core/vocabularies/${key}/terms/${spring}`, { actor: admin }))
    expect(inUse.status).toBe(409)
    expect(inUse.body.code).toBe('core.term.in-use')
    expect((await call(handle, 'DELETE', `/api/core/vocabularies/${key}/terms/${summer}`, { actor: admin })).status).toBe(200)
    expect((await terms(key)).map(t => t.label)).toEqual(['Spring'])

    // The database is the last word: a term in use cannot be deleted even behind the service's back.
    await expect(env.DB.prepare('DELETE FROM core_terms WHERE id = ?').bind(spring).run()).rejects.toThrow(/FOREIGN KEY/)
  })
})

describe('the renamed term', () => {
  it('shows the new label on every record without rewriting one', async () => {
    const workshop = await termNamed('Workshop')
    const production = await usedBy(workshop.id)
    const before = await rows('SELECT * FROM seats_performances WHERE id = ?', production)
    expect((await call(handle, 'PATCH', `${CATEGORY}/terms/${workshop.id}`, { actor: admin, body: { label: 'Workshop or class' } })).status).toBe(200)
    expect(await rows('SELECT * FROM seats_performances WHERE id = ?', production)).toEqual(before)
    expect(await inContext(() => getTerm(workshop.id))).toMatchObject({ label: 'Workshop or class', slug: 'workshop' })
    expect(await picker()).toContain('Workshop or class')
  })
})

describe('order', () => {
  it('reorders with every term listed, and refuses a list that has gone stale', async () => {
    const list = await terms('core.credit-section')
    const reversed = list.map(t => t.id).reverse()
    expect((await call(handle, 'PUT', '/api/core/vocabularies/core.credit-section/order', { actor: admin, body: { ids: reversed } })).status).toBe(200)
    expect((await terms('core.credit-section')).map(t => t.id)).toEqual(reversed)
    const stale = await json(call(handle, 'PUT', '/api/core/vocabularies/core.credit-section/order', { actor: admin, body: { ids: reversed.slice(1) } }))
    expect(stale.body.code).toBe('core.term.order-stale')
  })
})

describe('a locked vocabulary', () => {
  it('lets the theatre rename and reorder its terms, and nothing else', async () => {
    await inContext(async () => getTerm('trm_none')) // any read seeds core's vocabularies
    await env.DB.batch([
      env.DB.prepare("INSERT INTO core_vocabularies (key, owner, label, locked) VALUES ('seats.kinds', 'seats', 'Kinds', 1)"),
      env.DB.prepare("INSERT INTO core_terms (id, vocabulary_key, slug, label, sort, seeded, created_at) VALUES ('trm_2222222222aaaaaaaaaaaaaaaa', 'seats.kinds', 'a', 'Stalls', 0, 1, 0), ('trm_2222222222bbbbbbbbbbbbbbbb', 'seats.kinds', 'b', 'Circle', 1, 1, 0)"),
    ])
    const path = '/api/core/vocabularies/seats.kinds'
    expect((await json(call(handle, 'POST', `${path}/terms`, { actor: admin, body: { label: 'Gallery' } }))).body.code).toBe('core.vocabulary.locked')
    expect((await json(call(handle, 'POST', `${path}/terms/trm_2222222222aaaaaaaaaaaaaaaa/retire`, { actor: admin, body: {} }))).body.code).toBe('core.vocabulary.locked')
    expect((await call(handle, 'PATCH', `${path}/terms/trm_2222222222aaaaaaaaaaaaaaaa`, { actor: admin, body: { label: 'The stalls' } })).status).toBe(200)
    expect((await call(handle, 'PUT', `${path}/order`, { actor: admin, body: { ids: ['trm_2222222222bbbbbbbbbbbbbbbb', 'trm_2222222222aaaaaaaaaaaaaaaa'] } })).status).toBe(200)
    expect((await terms('seats.kinds')).map(t => t.label)).toEqual(['Circle', 'The stalls'])
  })
})

describe('the organisation\'s year end', () => {
  async function setYearEnd(value: string | null) {
    return inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.organisation.year-end', value, value === null ? { reset: true } : {})
      await unit.commit()
      return 'saved'
    }).catch(e => (isRefusal(e) ? e.code : String(e)))
  }

  it('takes a day that falls in every year as MM-DD, and refuses any other', async () => {
    expect(await setYearEnd('07-31')).toBe('saved')
    expect(await setYearEnd('02-29')).toBe('core.setting.rule-failed')
    expect(await setYearEnd('31-07')).toBe('core.setting.rule-failed')
    expect(await setYearEnd('7-31')).toBe('core.setting.rule-failed')
    expect(await setYearEnd(null)).toBe('saved')
  })
})
