// Records house open, curtain up and the other moments of the night (FH-22).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { TIMING_KINDS } from '../../../../db/schema'
import { recordTiming } from '../../../../night'

export default defineRoute({
  ability: 'front-of-house.assignment.check-in',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ kind: z.enum(TIMING_KINDS), at: z.number().int().positive().optional() }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await recordTiming(unit.view(), { performanceId: record!.id!, kind: input.kind, at: input.at, by: actor.accountId! })
  return { recorded: input.kind }
})
