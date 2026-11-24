// A budget's holders (BC-14): people whoever manages budgets names on it. Holding is the fact
// budgets.holder-of, read from budgets_holders at each request, which the theatre maps to
// budgets.budget.hold (by default). Removing a holder takes effect on their next request.
import { all, first, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel, canonicalAccount } from '#modules/core'

export interface Holder { accountId: string, name: string, addedAt: number }

export async function holdersOn(budgetId: string): Promise<Holder[]> {
  const rows = await all<{ accountId: string, addedAt: number }>('SELECT account_id AS accountId, added_at AS addedAt FROM budgets_holders WHERE budget_id = ? ORDER BY added_at', budgetId)
  const out: Holder[] = []
  for (const r of rows) out.push({ accountId: await canonicalAccount(r.accountId), name: await accountLabel(r.accountId), addedAt: r.addedAt })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether the person behind this account holds the budget, whichever of their merged ids it names. */
export async function holds(accountId: string, budgetId: string): Promise<boolean> {
  return !!(await first(`SELECT 1 FROM budgets_holders WHERE budget_id = ?1 AND account_id IN (${accountScopeSql('?2')})`, budgetId, accountId))
}

/** Every holder of a budget, as surviving account ids, for the fact's holders(). */
export async function holderIds(budgetId: string): Promise<string[]> {
  return [...new Set(await Promise.all((await all<{ id: string }>('SELECT account_id AS id FROM budgets_holders WHERE budget_id = ?', budgetId)).map(r => canonicalAccount(r.id))))].sort()
}

/** Names a holder. Not oneself: whoever manages budgets does not hand themselves approval of spending. */
export async function addHolder(unit: UnitView, actor: Actor, budgetId: string, accountId: string): Promise<void> {
  const person = await canonicalAccount(accountId)
  if (actor.accountId && person === await canonicalAccount(actor.accountId))
    refuse('budgets.holder.self', 'You cannot make yourself a holder of a budget.', { status: 403, remedy: 'Ask someone else who manages budgets.' })
  if (await holds(person, budgetId)) refuse('budgets.holder.already', 'They already hold this budget.', { status: 409 })
  unit.add({ sql: 'INSERT OR IGNORE INTO budgets_holders (budget_id, account_id, added_by, added_at) VALUES (?, ?, ?, ?)', params: [budgetId, person, actor.accountId ?? null, nowMs()] })
    .expect(1, { code: 'budgets.holder.already', reason: 'They already hold this budget.' })
  unit.audit({ action: 'update', record: ['budgets.budget', budgetId], detail: { holderAdded: person } })
}

export async function removeHolder(unit: UnitView, budgetId: string, accountId: string): Promise<void> {
  if (!(await holds(accountId, budgetId))) refuse('core.not-found', 'They do not hold this budget.', { status: 404 })
  unit.add({ sql: `DELETE FROM budgets_holders WHERE budget_id = ?1 AND account_id IN (${accountScopeSql('?2')})`, params: [budgetId, accountId] }) // not-policy: numbered parameters
    .expect(1, { code: 'budgets.holder.changed', reason: 'Someone has just removed them.' })
  unit.audit({ action: 'update', record: ['budgets.budget', budgetId], detail: { holderRemoved: accountId } })
}
