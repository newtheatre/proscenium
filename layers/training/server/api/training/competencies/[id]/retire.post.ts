// Retires a competency: nobody gains it from now, and holders' verdicts stop being met.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { retireCompetency } from '../../../../competencies'
import { noInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.competency.manage',
  record: event => ['training.competency', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: noInput,
}, (_event, { record, unit }) => retireCompetency(unit.view(), record!.id))
