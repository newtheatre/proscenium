// A person removes their bank details. Payments already made to them keep naming the row.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { clearPayee } from '../../../payees'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (_event, { unit, actor }) => ({
  cleared: await clearPayee(unit, { module: 'core', id: actor.accountId! }),
}))
