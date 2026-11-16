// A theatre's own vocabulary, keyed x.<name> (group 3).
import { defineRoute } from '#kit'
import { createVocabulary } from '../../../vocabularies/service'
import { vocabularyInput } from '../../../vocabularies/input'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  rateLimit: 'write',
  input: vocabularyInput,
}, async (_event, { input, unit }) => {
  return { key: await createVocabulary(unit, input) }
})
