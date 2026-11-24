// Sets the other books' code for a ledger account, or for one kind of posting on it (IE-02, E-06, E-14).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { codeNameSchema, codeSchema } from '../../../../../../shared/exports'
import { setCode } from '../../../../../profiles'

const KINDS = ['sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening'] as const

export default defineRoute({
  ability: 'invoicing.export.manage',
  rateLimit: 'write',
  record: event => ['invoicing.export-profile', getRouterParam(event, 'id')],
  input: z.object({
    accountId: z.string().min(1).max(40), // not-policy: an id's length
    postingKind: z.enum(KINDS).nullable(),
    code: codeSchema.nullable(),
    codeName: codeNameSchema.default(''),
    remove: z.boolean().optional(),
  }).strict(),
}, async (event, { input, unit, actor }) => {
  await setCode(unit, { ...input, profileId: getRouterParam(event, 'id')!, by: actor.accountId ?? null })
  return { ok: true }
})
