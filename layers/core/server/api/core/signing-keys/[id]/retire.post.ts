// Retires a signing key at once (Health screen, Retire now). Without confirm: true it refuses with
// the sentence saying what the key's retirement would invalidate, for the screen to show (F-37).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, isId, Refusal } from '#kit'
import { retireSigningKey } from '#kit/signing'

export default defineRoute({
  ability: 'core.signing-key.retire',
  rateLimit: 'write',
  input: z.object({ confirm: z.boolean().optional() }).strict(),
}, async (event, { unit, input }) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!isId('sgk', id)) throw new Refusal('core.not-found', 'There is no such signing key in use.', { status: 404 })
  return retireSigningKey(unit, id, { confirm: input.confirm })
})
