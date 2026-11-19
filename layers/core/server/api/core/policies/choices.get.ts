// The site's policies as values to pick from, for the "Policies that have been reviewed" setting.
import { defineRoute } from '#kit'
import { listPolicies } from '../../../policies/service'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  return { items: (await listPolicies()).map(p => ({ value: p.id, label: p.title })) }
})
