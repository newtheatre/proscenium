// Applies a run's new pattern ("Edit the run"): what it no longer has is removed, what moves is moved
// and what is new is added, in one unit. Refused if the preview the person saw is stale. The answer
// is what Undo sends back.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { editRun } from '../../../../../../programme/runs'
import { runEditInput } from '../../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: runEditInput,
}, async (event, { unit, record, input, actor }) => editRun(unit, record!.id, getRouterParam(event, 'run')!, input, actor))
