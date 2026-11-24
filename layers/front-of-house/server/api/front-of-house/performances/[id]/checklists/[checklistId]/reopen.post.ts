// Reopens a completed checklist run: for someone leading the night (part 3, "Checklists", rule 6).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reopenRun } from '../../../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.assignment.check-in',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { record, unit }) => {
  await reopenRun(unit.view(), { checklistId: getRouterParam(event, 'checklistId', { decode: true })!, performanceId: record!.id! })
  return { reopened: true }
})
