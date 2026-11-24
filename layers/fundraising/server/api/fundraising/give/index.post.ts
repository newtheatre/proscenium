// Give (FR-07): a pending gift with a payment of its own. The answer's token opens its thanks page.
import { defineRoute } from '#kit'
import { giveFields, startGift } from '../../../giving'

export default defineRoute({ public: true, rateLimit: 'public-form', protect: 'turnstile', idempotent: true, input: giveFields }, async (_event, { actor, input, unit }) =>
  startGift(unit.view(), actor, input))
