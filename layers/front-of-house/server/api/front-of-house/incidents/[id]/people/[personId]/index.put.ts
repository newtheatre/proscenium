// Changes a person involved (FH-29).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updatePerson } from '../../../../../../incidents'
import { personInput } from '../../../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: personInput,
}, async (event, { input, record, unit }) => {
  await updatePerson(unit.view(), record!.id!, getRouterParam(event, 'personId')!, input)
  return { updated: true }
})
