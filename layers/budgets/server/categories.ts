// What money is spent on (BC-03). Each category names an expense account given to Budgets, or none,
// when its spending posts to budgets.expenses. The presets are seeded when the module is switched on.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'

export interface Category {
  id: string
  slug: string
  name: string
  description: string
  accountId: string | null
  sortOrder: number
  archivedAt: number | null
}

const COLUMNS = 'id, slug, name, description, account_id AS accountId, sort_order AS sortOrder, archived_at AS archivedAt'

export const PRESET_CATEGORIES: readonly (readonly [string, string])[] = [
  ['set', 'Set'], ['costume', 'Costume'], ['lighting', 'Lighting'], ['sound', 'Sound'], ['publicity', 'Publicity'],
  ['rights', 'Rights and licences'], ['travel', 'Travel'], ['hospitality', 'Hospitality'], ['equipment', 'Equipment'], ['general', 'General'],
]

export async function listCategories(): Promise<Category[]> {
  return all<Category>(`SELECT ${COLUMNS} FROM budgets_categories ORDER BY archived_at IS NOT NULL, sort_order, name`)
}

export async function requireCategory(id: string | undefined): Promise<Category> {
  const row = id ? await first<Category>(`SELECT ${COLUMNS} FROM budgets_categories WHERE id = ?`, id) : null
  if (!row) refuse('core.not-found', 'There is no such category.', { status: 404 })
  return row!
}

export const categoryFields = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: the table's bound
  description: z.string().trim().max(300), // not-policy: the table's bound
  accountId: z.string().max(40).nullable(), // not-policy: ids are short
})

/** The account must be an active expense account given to Budgets. */
export async function checkAccount(accountId: string | null | undefined): Promise<void> {
  if (!accountId) return
  const row = await first("SELECT 1 FROM finance_accounts WHERE id = ? AND module = 'budgets' AND kind = 'expense' AND active = 1", accountId)
  if (!row) refuse('budgets.category.account', 'Choose an expense account given to Budgets.', { status: 422, fields: { accountId: 'budgets.category.account' } })
}

export function slugOf(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'category' // not-policy: a slug's length
}

/** Seeds the preset categories; ones already there, by slug, are left alone. */
export function seedCategories(unit: UnitView): void {
  const at = nowMs()
  PRESET_CATEGORIES.forEach(([slug, name], i) => {
    unit.add({
      sql: `INSERT INTO budgets_categories (id, slug, name, description, account_id, sort_order, created_at, updated_at)
            SELECT ?, ?, ?, '', NULL, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM budgets_categories WHERE slug = ? OR (name = ? AND archived_at IS NULL))`,
      params: [newId('bct'), slug, name, i + 1, at, at, slug, name],
    })
  })
}
