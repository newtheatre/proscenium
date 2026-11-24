// Makes a competency active; it needs an active route with an item to hold it by (R1).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { activateCompetency } from '../../../../competencies'
import { noInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.competency.manage',
  record: event => ['training.competency', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: noInput,
}, (_event, { record, unit }) => activateCompetency(unit.view(), record!.id))
