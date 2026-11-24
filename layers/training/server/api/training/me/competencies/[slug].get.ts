// The learner's page for one competency (M13, TR-50): every active route with their progress per item.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { competencyBySlug, waysFor } from '../../../../competencies'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (event, { actor }) => {
  const competency = await competencyBySlug(getRouterParam(event, 'slug') ?? '')
  if (!competency || competency.status !== 'active') refuse('training.competency.not-found', 'There is no such competency.', { status: 404 })
  return { competency, ...await waysFor(actor.accountId!, competency.id) }
})
