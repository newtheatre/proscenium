// The ledger's income accounts an income line can read (BC-07), by system key.
import { all, defineRoute } from '#kit'

export default defineRoute({ ability: 'budgets.budget.view', rateLimit: 'default' }, async () => ({
  sources: await all<{ key: string, name: string, module: string }>("SELECT system_key AS key, name, module FROM finance_accounts WHERE kind = 'income' AND system_key IS NOT NULL AND scope IS NULL AND active = 1 ORDER BY module, name"),
}))
