// Adds a collection, as a draft (C-60).
import { defineRoute } from '#kit'
import { createCollection } from '../../../programme/collections'
import { collectionInput } from '../../../programme/input'

export default defineRoute({
  ability: 'core.collection.manage',
  rateLimit: 'write',
  input: collectionInput,
}, async (_event, { input, unit, actor }) => ({ id: await createCollection(unit, input, actor.accountId ?? null) }))
