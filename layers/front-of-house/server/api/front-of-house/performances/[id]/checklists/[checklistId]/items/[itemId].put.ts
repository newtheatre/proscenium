// Enters one checklist item: done, an exception with its reason, or not applicable (FH-25). A queued
// write from a phone without signal carries the time it was entered.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { enterItem } from '../../../../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.checklist.complete',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    outcome: z.enum(['done', 'exception', 'not_applicable']),
    reading: z.number().int().nullish(),
    reasonCode: z.string().min(1).max(40).nullish(), // not-policy: shape bound
    reasonNote: z.string().trim().max(200).nullish(), // not-policy: shape bound, as the table's CHECK
    doneAt: z.number().int().positive().optional(),
  }).strict(),
}, async (event, { input, record, actor, unit }) => {
  await enterItem(unit.view(), {
    checklistId: getRouterParam(event, 'checklistId')!,
    performanceId: record!.id!,
    itemId: getRouterParam(event, 'itemId')!,
    ...input,
    by: actor.accountId!,
  })
  return { entered: true }
})
