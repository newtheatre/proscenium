// Set the abilities a fact brings (ID-22). A privileged ability needs the theatre's confirmation.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setFactAbilities } from '../../../identity/facts'

export default defineRoute({
  ability: 'core.role.manage',
  rateLimit: 'write',
  input: z.object({
    abilities: z.array(z.string().max(120)).max(500), // not-policy: bounds on a list of ability names
    confirmPrivileged: z.boolean().optional(),
  }).strict(),
}, async (event, { input, unit, actor }) => {
  const fact = getRouterParam(event, 'fact', { decode: true }) ?? ''
  await setFactAbilities(unit, actor, fact, input)
  return { fact }
})
