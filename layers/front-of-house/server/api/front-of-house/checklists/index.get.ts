// The theatre's checklists with their items (FH-24).
import { defineRoute } from '#kit'
import { listChecklists } from '../../../checklists'

export default defineRoute({
  ability: 'front-of-house.checklist.manage',
  rateLimit: 'default',
}, async () => ({ checklists: await listChecklists() }))
