// Saves a new report (REP-12): every rule is checked at once and the column at fault is named.
import { defineRoute } from '#kit'
import { createDefinition, definitionInput } from '../../../definitions'

export default defineRoute({ ability: 'reports.report.create', rateLimit: 'default', input: definitionInput }, async (_event, { actor, input, unit }) => createDefinition(unit.view(), actor, input))
