// Apply to the access scheme, answer a question about my application, or change an accepted one
// (ID-38, ID-44). A change goes to the reviewers; what was accepted stays in force meanwhile.
import { defineRoute } from '#kit'
import { apply, applicationInput } from '../../../identity/access-scheme'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: applicationInput }, async (_event, { input, unit, actor }) => {
  return apply(unit, actor, actor.accountId!, input)
})
