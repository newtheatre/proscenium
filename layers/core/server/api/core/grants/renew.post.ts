// Renew grants (ID-24): one action over a list, and each renewal is a new grant. A grant still
// live is ended as replaced, as a change is; one that has lapsed is simply given again. The new
// end comes from the role's rule, so a year-end role runs to the next year end.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { renewGrant } from '../../../identity/roles'

export default defineRoute({
  ability: 'core.grant.manage',
  rateLimit: 'write',
  input: z.object({ grantIds: z.array(z.string().max(40)).min(1).max(100) }).strict(), // not-policy: ids are short; a page of grants
}, async (_event, { input, unit, actor }) => {
  const renewed: Array<{ from: string, to: string }> = []
  for (const id of new Set(input.grantIds)) renewed.push({ from: id, to: await renewGrant(unit, actor, id) })
  return { renewed }
})
