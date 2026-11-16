// One vocabulary for its editing screen: every term, retired ones too, with how many records use each.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { getVocabulary, listTerms, termUsage } from '../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const vocabulary = await getVocabulary(record!.id) ?? refuse('core.vocabulary.not-found', 'There is no such vocabulary.', { status: 404 })
  const terms = await listTerms(vocabulary.key, { includeRetired: true })
  const usage = await termUsage(terms.map(t => t.id))
  return { vocabulary, terms: terms.map(t => ({ ...t, uses: usage.get(t.id) ?? 0 })) }
})
