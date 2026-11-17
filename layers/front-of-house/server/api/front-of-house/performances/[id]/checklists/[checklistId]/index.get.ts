// One checklist for a performance: its run's items and entries, or its items when no one has started it.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { getChecklist, readRun } from '../../../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.shift.view',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (event, { record }) => {
  const checklistId = getRouterParam(event, 'checklistId')!
  const run = await readRun(checklistId, record!.id!)
  if (run) return run
  const checklist = await getChecklist(checklistId)
  if (!checklist || checklist.archivedAt !== null) refuse('core.not-found', 'There is no such checklist.', { status: 404 })
  return { runId: null, checklistId, name: checklist.name, moment: checklist.moment, state: 'not_started', completedAt: null, items: checklist.items.map(i => ({ ...i, entry: null })) }
})
