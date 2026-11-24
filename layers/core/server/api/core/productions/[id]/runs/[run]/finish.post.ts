// Picks a run that stopped part way up where it stopped (C-04).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { finishRun } from '../../../../../../programme/runs'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => finishRun(unit, record!.id, getRouterParam(event, 'run', { decode: true })!))
