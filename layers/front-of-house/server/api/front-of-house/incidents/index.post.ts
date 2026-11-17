// Reports an incident or near miss (FH-27). A queued write from a phone without signal.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { INCIDENT_KINDS } from '../../../db/schema'
import { reportIncident } from '../../../incidents'

const id = z.string().min(1).max(40) // not-policy: shape bound

export default defineRoute({
  ability: 'front-of-house.incident.report',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    kind: z.enum(INCIDENT_KINDS),
    occurredAt: z.number().int().positive(),
    performanceId: id.nullish(),
    venueId: id.nullish(),
    spaceId: id.nullish(),
    whereNote: z.string().trim().max(120).nullish(), // not-policy: shape bound, as the table's CHECK
    whatHappened: z.string().trim().min(1).max(4000), // not-policy: shape bound, as the table's CHECK
    immediateAction: z.string().trim().max(2000).nullish(), // not-policy: shape bound, as the table's CHECK
    firstAidGiven: z.boolean().optional(),
    emergencyServicesCalled: z.boolean().optional(),
    serious: z.boolean().optional(),
  }).strict(),
}, (_event, { input, actor, unit }) => reportIncident(unit.view(), { ...input, by: actor.accountId! }))
