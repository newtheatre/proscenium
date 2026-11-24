// The crew calls, for the console list (FH-49). Archived ones come separately, below the divider.
import { defineRoute } from '#kit'
import { listCrewCalls } from '../../../crew-calls'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  rateLimit: 'default',
}, async () => {
  const calls = await listCrewCalls({ includeArchived: true })
  return { calls: calls.filter(c => c.state !== 'archived'), archived: calls.filter(c => c.state === 'archived') }
})
