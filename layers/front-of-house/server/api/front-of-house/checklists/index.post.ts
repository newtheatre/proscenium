// Adds a checklist (FH-24).
import { defineRoute } from '#kit'
import { createChecklist } from '../../../checklists'
import { checklistInput } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.checklist.manage',
  rateLimit: 'write',
  idempotent: true,
  input: checklistInput,
}, (_event, { input, unit }) => ({ checklistId: createChecklist(unit.view(), input) }))
