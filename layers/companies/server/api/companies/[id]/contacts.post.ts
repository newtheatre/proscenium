// Rules G2 and G4: adds a person who acts for the company; the first is its primary contact.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireCompany } from '../../../companies'
import { addContact, contactInput } from '../../../contacts'

export default defineRoute({
  ability: 'companies.contact.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: contactInput,
}, async (_event, { input, actor, record, unit }) => ({ contactId: await addContact(unit, actor, await requireCompany(record!.id), input) }))
