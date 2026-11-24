// Renames a heading (C-54).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { renameTermGroup } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key', { decode: true })],
  rateLimit: 'write',
  input: z.object({ label: z.string().trim().min(1).max(80) }), // not-policy: the label's bounds
}, async (event, { input, unit, record }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  await renameTermGroup(unit, record!.id, id, input.label)
  return { id }
})
