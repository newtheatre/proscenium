// Set the abilities a fact brings (ID-22), or pinned to one record of a pinnable fact's type. A
// privileged ability needs the theatre's confirmation.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setFactAbilities } from '../../../identity/facts'

export default defineRoute({
  ability: 'core.role.manage',
  rateLimit: 'write',
  input: z.object({
    abilities: z.array(z.string().max(120)).max(500), // not-policy: bounds on a list of ability names
    confirmPrivileged: z.boolean().optional(),
    // One record of a pinnable fact's type: the mapping then holds for that record alone.
    record: z.string().min(1).max(64).optional(), // not-policy: an id's bound
  }).strict(),
}, async (event, { input, unit, actor }) => {
  const fact = getRouterParam(event, 'fact') ?? ''
  await setFactAbilities(unit, actor, fact, input)
  return { fact, record: input.record ?? null }
})
