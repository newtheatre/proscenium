// Mark an accepted application verified, saying what evidence was seen, or remove the mark (ID-41).
// No card number, document or picture is taken.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setVerified } from '../../../../identity/access-scheme'
import { VERIFIED_METHODS } from '../../../../db/identity'

export default defineRoute({
  ability: 'core.access-scheme.review',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ method: z.enum(VERIFIED_METHODS).nullable() }).strict(),
}, async (_event, { input, record, unit, actor }) => {
  await setVerified(unit, actor, record!.id, input.method)
  return { ok: true }
})
