// Rules G2 and G4, CO-07: changes a contact's role, what they are sent, their phone, or makes them the primary.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireCompany } from '../../../../../companies'
import { changeContact, contactChangeInput } from '../../../../../contacts'

export default defineRoute({
  ability: 'companies.contact.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: contactChangeInput,
}, async (event, { input, record, unit }) => {
  changeContact(unit, await requireCompany(record!.id), getRouterParam(event, 'contact') ?? '', input)
  return { saved: true }
})
