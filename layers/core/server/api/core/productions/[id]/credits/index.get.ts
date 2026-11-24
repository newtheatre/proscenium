// A production's credits (C-09), or one performance's (C-61), with the sections a credit can be put in.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { listCredits } from '../../../../../programme/credits'
import { listTerms } from '../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({ performanceId: z.string().min(1).optional() }),
}, async (_event, { record, input }) => {
  const [credits, sections] = await Promise.all([listCredits(record!.id, input), listTerms('core.credit-section', { includeRetired: true })])
  return { credits, sections: sections.map(t => ({ id: t.id, label: t.label, retired: t.retired })) }
})
