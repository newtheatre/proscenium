// The templates a new form can start from (FB-208): the shipped ones and the theatre's own.
import { z } from 'zod'
import { can, defineRoute } from '#kit'
import { listTemplates } from '../../../templates'

export default defineRoute({ ability: 'forms.form.create', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  return { templates: await listTemplates(), canManage: (await can(actor, 'forms.template.manage')).allowed }
})
