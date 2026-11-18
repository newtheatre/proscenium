// What editing a run to a new pattern would add, move and remove ("Edit the run"), with what the
// changes to scheduled performances touch and the first module that refuses one. Reads only.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { planRunEdit } from '../../../../../../programme/runs'
import { runEditInput } from '../../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: runEditInput.omit({ seen: true }),
}, async (event, { record, input, actor }) => planRunEdit(record!.id, getRouterParam(event, 'run')!, input, actor))
