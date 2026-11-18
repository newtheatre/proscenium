// What a ::when block, a :fact token and a ::policy-table read on a page: which modules are on, the
// theatre's country, the facts and the generated tables. Settings come from /api/core/settings/public.
import { defineRoute } from '#kit'
import { policyContext } from '../../../policies/service'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  const { modules, country, facts, tables } = await policyContext()
  return { modules, country, facts, tables }
})
