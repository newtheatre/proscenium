// Adds a category (BC-03).
import { defineRoute, newId, nowMs } from '#kit'
import { categoryFields, checkAccount, slugOf } from '../../../categories'

export default defineRoute({ ability: 'budgets.category.manage', rateLimit: 'write', idempotent: true, input: categoryFields.partial({ description: true, accountId: true }) }, async (_event, { input, unit }) => {
  await checkAccount(input.accountId)
  const id = newId('bct')
  const at = nowMs()
  unit.add({
    sql: `INSERT OR IGNORE INTO budgets_categories (id, slug, name, description, account_id, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, (SELECT coalesce(max(sort_order), 0) + 1 FROM budgets_categories), ?, ?)`,
    params: [id, `${slugOf(input.name)}-${id.slice(-6)}`, input.name, input.description ?? '', input.accountId ?? null, at, at],
  }).expect(1, { code: 'budgets.category.name-taken', reason: `There is already a category called ${input.name}.` })
  unit.audit({ action: 'create', record: ['budgets.category', id] })
  return { categoryId: id }
})
