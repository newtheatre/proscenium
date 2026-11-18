// The policies this site has, for the footer and the /policies page.
import { defineRoute } from '#kit'
import { listPolicies } from '../../../policies/service'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  return { policies: (await listPolicies()).map(p => ({ id: p.id, title: p.title, summary: p.summary ?? null, kind: p.kind })) }
})
