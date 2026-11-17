// Applies a rota template to this one performance, from its own rota, whatever its space (FH-06).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { applyTemplate } from '../../../../../templates'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ templateId: z.string().min(1).max(40) }).strict(), // not-policy: shape bound
}, (_event, { input, record, unit }) => applyTemplate(unit.view(), input.templateId, [record!.id!], { bulk: false }))
