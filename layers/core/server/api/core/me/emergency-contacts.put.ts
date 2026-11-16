// Record up to three people to ring for me (ID-17). The person confirms they have told each
// contact their details are kept here. Without a standing the server refuses, as a missing page.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { MAX_CONTACTS, saveContacts } from '../../../identity/emergency-contacts'
import { isMember } from '../../../identity/standings'

const contact = z.object({
  name: z.string().trim().min(1).max(120), // not-policy: a person's name
  relationship: z.string().trim().max(40).nullable().optional().transform(v => v || null), // not-policy: the column's own length check
  phone: z.string().trim().min(3).max(40).regex(/^[0-9+()\-. ]+$/), // not-policy: a phone number in any common form
}).strict()

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ contacts: z.array(contact).max(MAX_CONTACTS), told: z.literal(true) }).strict(),
}, async (_event, { input, unit, actor }) => {
  if (!(await isMember(actor))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  saveContacts(unit, actor.accountId!, input.contacts.map(c => ({ name: c.name, relationship: c.relationship ?? null, phone: c.phone })))
  return { saved: input.contacts.length }
})
