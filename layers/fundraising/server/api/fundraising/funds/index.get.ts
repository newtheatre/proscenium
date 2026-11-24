// Funds (FR-05): every fund, the archived after the rest.
import { defineRoute } from '#kit'
import { listFunds } from '../../../funds'

export default defineRoute({ ability: 'fundraising.fund.manage', rateLimit: 'default' }, async () => ({ funds: await listFunds() }))
