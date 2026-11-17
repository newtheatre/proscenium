// C-54: in a grouped vocabulary the manager adds, renames, orders and removes headings and moves
// terms between them. A heading with terms cannot be removed; every term has a heading.
import { beforeEach, describe, expect, it } from 'vitest'
import getVocabulary from '../../server/api/core/vocabularies/[key]/index.get'
import addTerm from '../../server/api/core/vocabularies/[key]/terms/index.post'
import patchTerm from '../../server/api/core/vocabularies/[key]/terms/[id]/index.patch'
import addGroup from '../../server/api/core/vocabularies/[key]/groups/index.post'
import patchGroup from '../../server/api/core/vocabularies/[key]/groups/[id]/index.patch'
import deleteGroup from '../../server/api/core/vocabularies/[key]/groups/[id]/index.delete'
import orderGroups from '../../server/api/core/vocabularies/[key]/groups/order.put'
import { ensureVocabularies } from '../../server/vocabularies/service'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/vocabularies/:key': getVocabulary,
  'POST /api/core/vocabularies/:key/terms': addTerm,
  'PATCH /api/core/vocabularies/:key/terms/:id': patchTerm,
  'POST /api/core/vocabularies/:key/groups': addGroup,
  'PUT /api/core/vocabularies/:key/groups/order': orderGroups,
  'PATCH /api/core/vocabularies/:key/groups/:id': patchGroup,
  'DELETE /api/core/vocabularies/:key/groups/:id': deleteGroup,
})
const admin = person(['core.vocabulary.manage'])
const ADVISORY = '/api/core/vocabularies/core.advisory'
const CATEGORY = '/api/core/vocabularies/core.production-category'

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object) => json(call(handle, method, path, { actor: admin, body }))
async function read(path = ADVISORY) {
  await inContext(() => ensureVocabularies())
  return (await req('GET', path)).body
}

beforeEach(() => resetRateLimits())

describe('headings', () => {
  it('are listed with their term counts, and only for a grouped vocabulary', async () => {
    const { groups, vocabulary } = await read()
    expect(vocabulary.grouped).toBe(true)
    expect(groups).toHaveLength(groups.length)
    expect(groups.every((g: { terms: number }) => g.terms > 0)).toBe(true)
    expect((await read(CATEGORY)).groups).toEqual([])
    expect((await req('POST', `${CATEGORY}/groups`, { label: 'Nope' })).body.code).toBe('core.term.not-grouped')
  })

  it('are added, renamed and ordered, with one label each', async () => {
    const { body: { id } } = await req('POST', `${ADVISORY}/groups`, { label: 'Puppets and props' })
    expect((await req('POST', `${ADVISORY}/groups`, { label: 'PUPPETS AND PROPS' })).body.code).toBe('core.term-group.label-taken')
    expect((await req('PATCH', `${ADVISORY}/groups/${id}`, { label: 'Puppetry' })).status).toBe(200)
    const before = (await read()).groups.map((g: { id: string }) => g.id)
    const reversed = [...before].reverse()
    expect((await req('PUT', `${ADVISORY}/groups/order`, { ids: reversed })).status).toBe(200)
    expect((await read()).groups.map((g: { id: string }) => g.id)).toEqual(reversed)
    expect((await req('PUT', `${ADVISORY}/groups/order`, { ids: reversed.slice(1) })).body.code).toBe('core.term-group.order-stale')
  })

  it('cannot be removed while terms sit under them', async () => {
    const { groups } = await read()
    const full = groups.find((g: { terms: number }) => g.terms > 0)
    expect((await req('DELETE', `${ADVISORY}/groups/${full.id}`)).body.code).toBe('core.term-group.not-empty')
    const { body: { id } } = await req('POST', `${ADVISORY}/groups`, { label: 'Empty heading' })
    expect((await req('DELETE', `${ADVISORY}/groups/${id}`)).status).toBe(200)
  })
})

describe('terms in a grouped vocabulary', () => {
  it('need a heading of their own vocabulary, and can move between headings', async () => {
    const { groups } = await read()
    expect((await req('POST', `${ADVISORY}/terms`, { label: 'Fog of war' })).body.code).toBe('core.term.group-needed')
    expect((await req('POST', `${ADVISORY}/terms`, { label: 'Fog of war', groupId: 'tgr_missing' })).status).toBeGreaterThanOrEqual(400)
    const made = await req('POST', `${ADVISORY}/terms`, { label: 'Fog of war', groupId: groups[0].id })
    expect(made.status).toBe(200)
    expect((await req('PATCH', `${ADVISORY}/terms/${made.body.id}`, { groupId: groups[1].id })).status).toBe(200)
    expect((await read()).terms.find((t: { id: string }) => t.id === made.body.id).groupId).toBe(groups[1].id)
    expect((await req('PATCH', `${ADVISORY}/terms/${made.body.id}`, { groupId: null })).body.code).toBe('core.term.group-needed')
  })

  it('take no heading in a vocabulary without headings', async () => {
    const { groups } = await read()
    expect((await req('POST', `${CATEGORY}/terms`, { label: 'Panto', groupId: groups[0].id })).body.code).toBe('core.term.not-grouped')
    expect((await req('POST', `${CATEGORY}/terms`, { label: 'Panto' })).status).toBe(200)
  })
})
