// The theatre's rota templates with their lines.
import { defineRoute } from '#kit'
import { listTemplates } from '../../../templates'

export default defineRoute({ ability: 'front-of-house.duty.manage', rateLimit: 'default' }, async () => {
  const all = await listTemplates({ includeArchived: true })
  return { templates: all.filter(t => t.archivedAt === null), archived: all.filter(t => t.archivedAt !== null) }
})
