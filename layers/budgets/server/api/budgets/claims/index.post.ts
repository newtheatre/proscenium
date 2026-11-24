// Starts a claim as a draft (BC-19), optionally fulfilling one of the person's approved requests (BC-27).
import { defineRoute } from '#kit'
import { createClaim } from '../../../claims'
import { claimFields } from '../../../claim-input'

export default defineRoute({ ability: 'budgets.claim.make', rateLimit: 'write', idempotent: true, input: claimFields }, async (_event, { input, unit, actor }) => (
  { claimId: await createClaim(unit, actor, input) }
))
