// Adds the run's performances the person accepted (C-04): whole or not at all within the kit's
// limit on rows in one unit, or as a run the core.create-run job makes in chunks.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { createRun } from '../../../../../programme/runs'
import { runInput } from '../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: runInput,
}, async (_event, { unit, record, input }) => createRun(unit, record!.id, input))
