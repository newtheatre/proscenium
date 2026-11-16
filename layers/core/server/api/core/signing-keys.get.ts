// The signing keys still in use, for the Health screen: purpose, state, dates and what retiring each
// would invalidate. Never a key itself (F-37).
import { defineRoute } from '#kit'
import { listSigningKeys } from '#kit/signing'

export default defineRoute({ ability: 'core.health.view', rateLimit: 'default' }, async () => {
  return { keys: await listSigningKeys() }
})
