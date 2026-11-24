// The signed-in person's own training records (TR-07). Only ever the caller's rows.
import { defineRoute } from '#kit'
import { recordsOf } from '../../../progress'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (_event, { actor }) => ({ records: await recordsOf(actor.accountId!) }))
