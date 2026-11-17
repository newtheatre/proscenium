// Redacts one person with no account from an incident, for a data request (FH-35).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { redactPerson } from '../../../../privacy'

export default defineRoute({
  ability: 'front-of-house.incident.redact-person',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  await redactPerson(unit.view(), getRouterParam(event, 'id')!)
  return { redacted: true }
})
