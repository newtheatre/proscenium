// Bar products, as a kind of item a promotion can apply to or require (promotions.target; the
// unified promotions design, "How modules plug in"). A promotion can be narrowed to a category (a
// parent category takes in the categories under it), a product, one of its sizes, and an outlet.
// A saving on a line stands while the line is being paid for or paid, and not wholly refunded.
import { all, first, refuse } from '#kit'

type Scope = Record<string, string>
const FIELDS = ['categoryId', 'productId', 'variantId', 'outletId'] as const

const wrong = (field: string, reason: string): never => refuse('bar.promotion.scope', reason, { status: 422, fields: { [field]: 'Choose another.' } })

export default {
  label: 'bar.promotions.items',
  module: 'bar',
  order: 20, // not-policy: after tickets

  async fields() {
    const [categories, products, variants, outlets] = await Promise.all([
      all<{ id: string, name: string, parent: string | null }>('SELECT c.id, c.name, p.name AS parent FROM bar_categories c LEFT JOIN bar_categories p ON p.id = c.parent_id WHERE c.active = 1 ORDER BY coalesce(p.position, c.position), c.parent_id IS NOT NULL, c.position, c.name'),
      all<{ id: string, name: string, category_id: string }>('SELECT id, name, category_id FROM bar_products WHERE active = 1 ORDER BY lower(name), id'),
      all<{ id: string, name: string, product_id: string }>('SELECT v.id, v.name, v.product_id FROM bar_variants v JOIN bar_products p ON p.id = v.product_id WHERE v.active = 1 AND v.mixer_measure = 0 AND p.active = 1 ORDER BY v.position, v.name'),
      all<{ id: string, name: string }>('SELECT id, name FROM bar_outlets WHERE active = 1 ORDER BY lower(name), id'),
    ])
    return [
      { id: 'categoryId', label: 'bar.promotions.category', options: categories.map(c => ({ value: c.id, label: c.parent ? `${c.parent} › ${c.name}` : c.name })) },
      { id: 'productId', label: 'bar.promotions.product', options: products.map(p => ({ value: p.id, label: p.name })) },
      { id: 'variantId', label: 'bar.promotions.size', parent: 'productId', needsParent: true, options: variants.map(v => ({ value: v.id, label: v.name, parent: v.product_id })) },
      { id: 'outletId', label: 'bar.promotions.outlet', options: outlets.map(o => ({ value: o.id, label: o.name })) },
    ]
  },

  async check(typed: Scope): Promise<Scope> {
    const scope: Scope = {}
    for (const f of FIELDS) if (typed[f]) scope[f] = typed[f]!
    // A size is its product's, and a product its category's, so the narrower names the wider too.
    if (scope.variantId) {
      const variant = await first<{ product_id: string }>('SELECT product_id FROM bar_variants WHERE id = ? AND mixer_measure = 0', scope.variantId)
      if (!variant) wrong('variantId', 'There is no such size.')
      if (scope.productId && variant!.product_id !== scope.productId) wrong('variantId', 'That size is not of that product.')
      scope.productId = variant!.product_id
    }
    if (scope.productId) {
      const product = await first<{ category_id: string, parent_id: string | null }>('SELECT p.category_id, c.parent_id FROM bar_products p JOIN bar_categories c ON c.id = p.category_id WHERE p.id = ?', scope.productId)
      if (!product) wrong('productId', 'There is no such product.')
      if (scope.categoryId && scope.categoryId !== product!.category_id && scope.categoryId !== product!.parent_id) wrong('productId', 'That product is not in that category.')
      delete scope.categoryId // the product says it
    }
    if (scope.categoryId && !await first('SELECT 1 FROM bar_categories WHERE id = ?', scope.categoryId)) wrong('categoryId', 'There is no such category.')
    if (scope.outletId && !await first('SELECT 1 FROM bar_outlets WHERE id = ?', scope.outletId)) wrong('outletId', 'There is no such outlet.')
    return scope
  },

  async describe(scope: Scope): Promise<string | null> {
    const name = async (table: string, id: string | undefined) => id ? (await first<{ name: string }>(`SELECT name FROM ${table} WHERE id = ?`, id))?.name : null
    const words = [
      await name('bar_categories', scope.categoryId),
      await name('bar_products', scope.productId),
      await name('bar_variants', scope.variantId),
      await name('bar_outlets', scope.outletId),
    ].filter(Boolean)
    return words.length ? words.join(', ') : null
  },

  matches(scope: Scope, facts: Record<string, unknown>): boolean {
    if (scope.categoryId && scope.categoryId !== facts.categoryId && scope.categoryId !== facts.parentCategoryId) return false
    return (['productId', 'variantId', 'outletId'] as const).every(f => !scope[f] || scope[f] === facts[f])
  },

  async live(refs: string[]): Promise<Set<string>> {
    const rows = await all<{ id: string }>(
      `SELECT l.id FROM bar_sale_lines l JOIN bar_sales s ON s.id = l.sale_id
        WHERE l.id IN (SELECT value FROM json_each(?)) AND s.state IN ('awaiting_payment', 'paid')
          AND coalesce((SELECT sum(r.quantity) FROM bar_sale_reversals r WHERE r.sale_line_id = l.id AND r.state <> 'failed'), 0) < l.quantity`,
      JSON.stringify(refs),
    )
    return new Set(rows.map(r => r.id))
  },
}
