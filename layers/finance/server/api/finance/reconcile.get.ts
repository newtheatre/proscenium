// Reconciliation by totals (FIN-06, first release): each clearing account's balance, what payouts
// have taken out of it and when the last one was entered.
import { defineRoute } from '#kit'
import { clearingAccounts } from '../../reports'

export default defineRoute({ ability: 'finance.ledger.view', rateLimit: 'default' }, async () => ({ accounts: await clearingAccounts() }))
