// A manager puts someone on a shift (FH-12). Unmet requirements are refused unless overridden.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { assignPerson } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.shift', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ accountId: z.string().min(1).max(40), override: z.boolean().optional() }).strict(), // not-policy: shape bound
}, (_event, { input, record, actor, unit }) => assignPerson(unit.view(), { shiftId: record!.id!, accountId: input.accountId, by: actor.accountId!, override: input.override }))
