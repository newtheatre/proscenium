// Read one member's emergency contacts, with a reason (ID-17). Strong, never asked again, audited
// with the reason and shown to the person. There is no list of contacts for a team or a night.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { READ_REASONS, emergencyContactsOf } from '../../../../identity/emergency-contacts'

export default defineRoute({
  ability: 'core.emergency-contact.read',
  record: event => ['core.account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({ reason: z.enum(READ_REASONS) }).strict(),
}, async (_event, { input, record, unit, actor }) => {
  return { contacts: await emergencyContactsOf(unit, actor, record!.id, input.reason) }
})
