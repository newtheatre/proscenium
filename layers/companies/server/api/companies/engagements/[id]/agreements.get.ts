// Every version of the engagement's agreement, newest first, for staff and for the company's contacts.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { agreementVersions } from '../../../../agreements'
import { requireEngagement } from '../../../../engagements'
import { liveContactNames } from '../../../../views'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const record = ['companies.engagement', getRouterParam(event, 'id') ?? ''] as const
  const [manage, view, answer] = await Promise.all((['companies.agreement.manage', 'companies.engagement.view', 'companies.agreement.answer'] as const).map(a => can(actor, a, record).then(d => d.allowed)))
  if (!view && !answer) refuse('core.access.denied', 'You cannot see this engagement\'s agreement.', { status: 403 })
  const engagement = await requireEngagement(record[1])
  return {
    versions: (await agreementVersions(record[1])).filter(v => view || v.sentAt !== null),
    canManage: manage,
    canAnswer: answer,
    canRecord: (await can(actor, 'companies.agreement.record')).allowed,
    contacts: manage ? await liveContactNames(engagement.companyId) : [],
  }
})
