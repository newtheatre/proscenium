// Starts a checklist for a performance: its items are fixed from now (FH-25).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { openRun, readRun } from '../../../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.checklist.complete',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { record, unit }) => {
  const checklistId = getRouterParam(event, 'checklistId')!
  await openRun(unit.view(), checklistId, record!.id!)
  await unit.commit()
  return readRun(checklistId, record!.id!)
})
