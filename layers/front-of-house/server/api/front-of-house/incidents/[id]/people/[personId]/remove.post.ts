// Takes a person off an incident, as when they were added by mistake (FH-29).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removePerson } from '../../../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { record, unit }) => {
  removePerson(unit.view(), record!.id!, getRouterParam(event, 'personId', { decode: true })!)
  return { removed: true }
})
