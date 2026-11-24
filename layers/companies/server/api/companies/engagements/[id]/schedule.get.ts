// An engagement's calls and people (CO-23, CO-24), for staff and for the company's contacts.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { schedule, spaceChoices } from '../../../../calls'
import { requireEngagement } from '../../../../engagements'
import { peopleAccess, started } from '../../../../people'
import type { Schedule } from '../../../../../shared/views'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }): Promise<Schedule> => {
  const record = ['companies.engagement', getRouterParam(event, 'id') ?? ''] as const
  const [view, own] = await Promise.all((['companies.engagement.view', 'companies.engagement.view-own'] as const).map(a => can(actor, a, record).then(d => d.allowed)))
  if (!view && !own) refuse('core.access.denied', 'You cannot see this engagement.', { status: 403 })
  const engagement = await requireEngagement(record[1])
  const [{ calls, people }, access, begun] = await Promise.all([schedule(engagement.id), peopleAccess(actor, engagement), started(engagement)])
  return {
    calls,
    people,
    spaces: access.staff ? await spaceChoices() : [],
    canManageCalls: access.staff,
    canManagePeople: access.canManage,
    started: begun,
  }
})
