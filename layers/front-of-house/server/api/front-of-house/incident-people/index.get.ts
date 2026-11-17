// Finds people with no account on incidents by name or contact, for a data request (FH-35). Every
// search is audited, and never records the text typed.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchPeople } from '../../../privacy'

export default defineRoute({
  ability: 'front-of-house.incident.redact-person',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(2).max(120) }), // not-policy: shape bound
}, async (_event, { input }) => ({ people: await searchPeople(input.q) }))
