// Rule G4 and CO-05: ends a contact; their access through companies.contact-of ends with this batch.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { endContact, endInput, requireCompany } from '../../../../../contacts'

export default defineRoute({
  ability: 'companies.contact.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: endInput,
}, async (event, { input, record, unit }) => {
  await endContact(unit, await requireCompany(record!.id), getRouterParam(event, 'contact') ?? '', input)
  return { ended: true }
})
