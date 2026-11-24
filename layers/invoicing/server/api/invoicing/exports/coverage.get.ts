// What a file would hold before it is taken (IE-03): first and last day, lines, unmapped lines and accounts, Closed or Open.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { getProfile } from '../../../profiles'
import { coverage, EXPORT_CEILING } from '../../../build'
import { requireLedgerView } from '../../../ledger-view'

export default defineRoute({
  ability: 'invoicing.export.take',
  rateLimit: 'default',
  input: z.object({ profileId: z.string().min(1).max(40), from: z.iso.date(), to: z.iso.date() }), // not-policy: an id's length
}, async (_event, { input, actor }) => {
  await requireLedgerView(actor)
  const result = await coverage(await getProfile(input.profileId), input.from, input.to)
  return { ...result, tooMany: result.lines > EXPORT_CEILING, ceiling: EXPORT_CEILING }
})
