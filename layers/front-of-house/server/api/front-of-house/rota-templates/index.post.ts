// Adds a rota template: a named set of duties and places (FH-05).
import { defineRoute } from '#kit'
import { createTemplate } from '../../../templates'
import { templateInput } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: templateInput,
}, (_event, { input, unit }) => ({ templateId: createTemplate(unit.view(), input) }))
