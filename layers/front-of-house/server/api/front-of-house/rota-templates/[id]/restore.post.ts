// Brings an archived rota template back. It is never the default until someone says so again (FH-05).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { restoreTemplate } from '../../../../templates'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  await restoreTemplate(unit.view(), getRouterParam(event, 'id')!)
  return { templateId: getRouterParam(event, 'id') }
})
