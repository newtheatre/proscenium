// The chart of accounts, with each account's balance across every sealed posting.
import { all, defineRoute } from '#kit'
import { useRegistry } from '#kit/registry'
import { balances } from '../../ledger'

export default defineRoute({ ability: 'finance.ledger.view', rateLimit: 'default' }, async () => {
  const rows = await all<{ id: string, code: string, name: string, kind: string, module: string, system_key: string | null, scope: string | null, active: number }>(
    'SELECT id, code, name, kind, module, system_key, scope, active FROM finance_accounts ORDER BY code')
  const totals = await balances()
  return {
    // The modules an added account may be given to.
    modules: [...useRegistry().modules.keys()].sort(),
    accounts: rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind,
      module: r.module,
      systemKey: r.system_key,
      scope: r.scope,
      active: r.active === 1,
      locked: r.system_key !== null,
      balances: totals.filter(b => b.accountId === r.id).map(b => ({ currency: b.currency, debitsMinor: b.debitsMinor, creditsMinor: b.creditsMinor, balanceMinor: b.balanceMinor })),
    })),
  }
})
