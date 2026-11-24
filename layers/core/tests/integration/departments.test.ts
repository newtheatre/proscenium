// R3-07: one department list for every module, core.department, seeded with Productions' twelve
// production terms and Budgets' six organisation terms. A term's kind is its heading, by the
// heading's slug, so a picker narrows to one kind and keeps doing so after the theatre renames it.
import { describe, expect, it } from 'vitest'
import patchGroup from '../../server/api/core/vocabularies/[key]/groups/[id]/index.patch'
import { ensureVocabularies, listTermGroups, listTerms } from '../../server/vocabularies/service'
import { call, inContext, person, server } from '../../../../tests/integration/helpers'

const handle = server({ 'PATCH /api/core/vocabularies/:key/groups/:id': patchGroup })

describe('core.department', () => {
  it('starts with production and organisation terms under two headings', async () => {
    const { all, production, organisation } = await inContext(async () => {
      await ensureVocabularies()
      return {
        all: await listTerms('core.department'),
        production: await listTerms('core.department', { group: 'production' }),
        organisation: await listTerms('core.department', { group: 'organisation' }),
      }
    })
    expect(all).toHaveLength(18)
    expect(production.map(t => t.slug)).toEqual(['creative', 'cast', 'stage-management', 'lighting', 'sound', 'video', 'set', 'props', 'costume', 'hair-and-make-up', 'music', 'production'])
    expect(organisation.map(t => t.slug)).toEqual(['technical', 'publicity', 'front-of-house', 'bar', 'social', 'general'])
  })

  it('narrows by kind after the theatre renames a heading', async () => {
    const groups = await inContext(() => listTermGroups('core.department'))
    const organisation = groups.find(g => g.label === 'Organisation')!
    const response = await call(handle, 'PATCH', `/api/core/vocabularies/core.department/groups/${organisation.id}`, { actor: person(['core.vocabulary.manage']), body: { label: 'Society' } })
    expect(response.status).toBe(200)
    const narrowed = await inContext(() => listTerms('core.department', { group: 'organisation' }))
    expect(narrowed).toHaveLength(6)
    expect(await inContext(() => listTerms('core.department', { group: 'society' }))).toEqual([])
  })
})
