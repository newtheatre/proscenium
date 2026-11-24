// A new fund and its donations account (FR-05).
import { defineRoute } from '#kit'
import { createFund, fundFields } from '../../../funds'

export default defineRoute({ ability: 'fundraising.fund.manage', rateLimit: 'write', idempotent: true, input: fundFields }, async (_event, { input, unit }) => (
  { fundId: await createFund(unit.view(), input) }
))
