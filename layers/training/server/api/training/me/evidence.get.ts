// The signed-in person's own certificates and declarations, newest first.
import { defineRoute, refuse } from '#kit'
import { myEvidence } from '../../../evidence'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (_event, { actor }) => {
  if (!actor.accountId) refuse('core.auth.required', 'Sign in first.', { status: 401 })
  return { evidence: await myEvidence(actor.accountId) }
})
