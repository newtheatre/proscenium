// Undo for an edit of a run: puts back what the edit changed, from the edit's own answer.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { undoRunEdit } from '../../../../../../programme/runs'
import { runEditUndoInput } from '../../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: runEditUndoInput,
}, async (event, { unit, record, input, actor }) => undoRunEdit(unit, record!.id, getRouterParam(event, 'run')!, input, actor))
