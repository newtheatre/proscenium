// Record up to three people to ring for me (ID-17). The person confirms they have told each
// contact their details are kept here. Without a standing the server refuses, as a missing page.
import { defineRoute, refuse } from '#kit'
import { saveContacts } from '../../../identity/emergency-contacts'
import { isMember } from '../../../identity/standings'
import { emergencyContactsInput } from '../../../../shared/emergency-contacts'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: emergencyContactsInput,
}, async (_event, { input, unit, actor }) => {
  if (!(await isMember(actor))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  saveContacts(unit, actor.accountId!, input.contacts.map(c => ({ name: c.name, relationship: c.relationship ?? null, phone: c.phone })))
  return { saved: input.contacts.length }
})
