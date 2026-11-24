// Every performance a run's pattern would make, each marked if it is past, clashes or falls in a
// closure (C-04). Reads only: nothing is saved until the person adds the run.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { planRun } from '../../../../../programme/runs'
import { runPattern } from '../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: runPattern,
}, async (_event, { record, input }) => planRun(record!.id, input))
