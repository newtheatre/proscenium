// The Companies list (part 5): every company, archived ones last, with its live engagements, the kinds
// of engagement it has had, its primary contact and its last date.
import { can, defineRoute } from '#kit'
import { listCompanies } from '../../views'

export default defineRoute({ ability: 'companies.company.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  companies: await listCompanies(),
  canManage: (await can(actor, 'companies.company.manage')).allowed,
}))
