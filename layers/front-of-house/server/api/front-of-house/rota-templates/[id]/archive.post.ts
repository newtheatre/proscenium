// Archives a rota template.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { archiveTemplate } from '../../../../templates'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { unit }) => {
  archiveTemplate(unit.view(), getRouterParam(event, 'id')!)
  return { templateId: getRouterParam(event, 'id') }
})
