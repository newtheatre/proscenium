// Archives a checklist. Runs that used it keep their entries (FH-24).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { archiveChecklist } from '../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.checklist.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { unit }) => {
  archiveChecklist(unit.view(), getRouterParam(event, 'id')!)
  return { archived: true }
})
