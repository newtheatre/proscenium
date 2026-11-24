// The person takes back their own evidence while it is still waiting.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { withdrawEvidence } from '../../../../evidence'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  await withdrawEvidence(unit.view(), actor, getRouterParam(event, 'id')!)
  return { ok: true }
})
