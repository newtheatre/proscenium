// Rule G1 and CO-06: companies whose names nearly match one being typed, so New company can offer them.
import { defineRoute } from '#kit'
import { matchesInput, nearMatches } from '../../companies'

export default defineRoute({ ability: 'companies.company.manage', rateLimit: 'default', input: matchesInput }, async (_event, { input }) => ({ matches: await nearMatches(input.name) }))
