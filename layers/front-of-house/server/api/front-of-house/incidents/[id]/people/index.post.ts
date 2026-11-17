// Adds a person involved: an account, or a name and contact. Welfare details are sealed (FH-29).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addPerson } from '../../../../../incidents'
import { personInput } from '../../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: personInput,
}, async (_event, { input, record, unit }) => ({ personId: await addPerson(unit.view(), record!.id!, input) }))
