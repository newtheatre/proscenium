// The theatre's rota templates with their lines.
import { defineRoute } from '#kit'
import { listTemplates } from '../../../templates'

export default defineRoute({ ability: 'front-of-house.duty.manage', rateLimit: 'default' }, async () => ({ templates: await listTemplates() }))
