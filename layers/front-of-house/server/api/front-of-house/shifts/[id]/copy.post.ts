// Copies a shift not tied to a performance to other days at the same local times (FH-48).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { copyShift } from '../../../../grid'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.shift', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31) }).strict(), // not-policy: as a batch's bound
}, async (_event, { input, record, unit }) => ({ shiftIds: await copyShift(unit.view(), record!.id!, input.days) }))
