// An engagement in outline, for staff who may view it and for the company's live contacts (the fact).
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { requireEngagement } from '../../../../engagements'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const record = ['companies.engagement', getRouterParam(event, 'id') ?? ''] as const
  const staff = await can(actor, 'companies.engagement.view', record)
  if (!staff.allowed && !(await can(actor, 'companies.engagement.view-own', record)).allowed)
    refuse('core.access.denied', 'You cannot see this engagement.', { status: 403 })
  return { engagement: await requireEngagement(record[1]) }
})
