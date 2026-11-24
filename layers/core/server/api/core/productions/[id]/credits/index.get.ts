// A production's credits (C-09), with the sections a credit can be put in.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { listCredits } from '../../../../../programme/credits'
import { listTerms } from '../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const [credits, sections] = await Promise.all([listCredits(record!.id), listTerms('core.credit-section', { includeRetired: true })])
  return { credits, sections: sections.map(t => ({ id: t.id, label: t.label, retired: t.retired })) }
})
