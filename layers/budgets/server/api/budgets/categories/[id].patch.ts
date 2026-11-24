// Edits a category, or archives and restores it (BC-03). Lines already on it keep it.
import { getRouterParam } from 'h3'
import { defineRoute, nowMs } from '#kit'
import { z } from 'zod'
import { categoryFields, checkAccount, requireCategory } from '../../../categories'

export default defineRoute({ ability: 'budgets.category.manage', rateLimit: 'write', input: categoryFields.extend({ archived: z.boolean() }).partial() }, async (event, { input, unit }) => {
  const category = await requireCategory(getRouterParam(event, 'id'))
  const fields: string[] = []
  const sets: string[] = []
  const params: unknown[] = []
  const set = (field: string, column: string, value: unknown) => {
    fields.push(field)
    sets.push(`${column} = ?`)
    params.push(value)
  }
  if (input.name !== undefined && input.name !== category.name) set('name', 'name', input.name)
  if (input.description !== undefined && input.description !== category.description) set('description', 'description', input.description)
  if (input.accountId !== undefined && input.accountId !== category.accountId) {
    await checkAccount(input.accountId)
    set('account', 'account_id', input.accountId)
  }
  if (input.archived !== undefined && input.archived !== !!category.archivedAt) set(input.archived ? 'archived' : 'restored', 'archived_at', input.archived ? nowMs() : null)
  if (!sets.length) return { categoryId: category.id }
  unit.add({ sql: `UPDATE OR IGNORE budgets_categories SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, params: [...params, nowMs(), category.id] })
    .expect(1, { code: 'budgets.category.name-taken', reason: 'Another category already has that name.' })
  unit.audit({ action: 'update', record: ['budgets.category', category.id], detail: { fields } })
  return { categoryId: category.id }
})
