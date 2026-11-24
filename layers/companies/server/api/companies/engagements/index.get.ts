// The Engagements list (part 5): every engagement with its company and dates, newest first.
import { can, defineRoute } from '#kit'
import { listEngagements } from '../../../views'

export default defineRoute({ ability: 'companies.engagement.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  engagements: await listEngagements(),
  canManage: (await can(actor, 'companies.engagement.manage')).allowed,
}))
