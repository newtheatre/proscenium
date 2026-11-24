// Brings an archived checklist back with its items (FH-24).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { restoreChecklist } from '../../../../checklists'

export default defineRoute({
  ability: 'front-of-house.checklist.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { unit }) => {
  restoreChecklist(unit.view(), getRouterParam(event, 'id', { decode: true })!)
  return { restored: true }
})
