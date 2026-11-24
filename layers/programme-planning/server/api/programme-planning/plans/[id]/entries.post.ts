// PP-02: an entry typed into the tray: a title, kind, running time, get-in, get-out and how many performances it wants.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addEntry, entryInput, requirePlan } from '../../../../plans'

export default defineRoute({
  ability: 'programme-planning.entry.manage',
  record: event => ['programme-planning.plan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: entryInput,
}, async (_event, { input, record, unit }) => ({ entryId: await addEntry(unit, await requirePlan(record!.id), input) }))
