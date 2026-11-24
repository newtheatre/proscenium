// A module key's values with their names, for a filter's choices (REP-43). Shared keys are records,
// chosen with the record pickers.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { keyValues } from '../../../../keys'

export default defineRoute({ ability: 'reports.report.create', rateLimit: 'default' }, async event => ({ values: await keyValues(getRouterParam(event, 'key')!) }))
