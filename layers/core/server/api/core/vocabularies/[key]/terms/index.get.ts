// A picker's options: the live terms in order. Any signed-in person may read them.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { getVocabulary, listTerms } from '../../../../../vocabularies/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event) => {
  const vocabulary = await getVocabulary(getRouterParam(event, 'key') ?? '') ?? refuse('core.vocabulary.not-found', 'There is no such vocabulary.', { status: 404 })
  const terms = await listTerms(vocabulary.key)
  return { terms: terms.map(t => ({ id: t.id, slug: t.slug, label: t.label, description: t.description, icon: t.icon })) }
})
