// Takes back a recorded moment of the night: the board's Undo, and the lead's correction (NI-2).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { TIMING_KINDS } from '../../../../../db/schema'
import { clearTiming, type TimingKind } from '../../../../../night'

export default defineRoute({
  ability: 'front-of-house.assignment.check-in',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { record, unit }) => {
  const kind = getRouterParam(event, 'kind', { decode: true }) ?? ''
  if (!(TIMING_KINDS as readonly string[]).includes(kind)) refuse('core.not-found', 'There is no such timing.', { status: 404 })
  clearTiming(unit.view(), { performanceId: record!.id!, kind: kind as TimingKind })
  return { cleared: kind }
})
