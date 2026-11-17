// Completes a checklist run once every required item has an entry (FH-25).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { completeRun } from '../../../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.checklist.complete',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { record, actor, unit }) => completeRun(unit.view(), { checklistId: getRouterParam(event, 'checklistId')!, performanceId: record!.id!, by: actor.accountId! }))
