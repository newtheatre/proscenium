// Allergens (Bar specification, tab 10; build steps 1 and 2): recorded from the label on each stock
// item, on each product with no recipe, and on each choice option with no stock item, with every check
// kept. A product made from stock works its answer out from its recipe: what any of its items contains,
// and checked only when every one of them is. The till gives one of three answers for each of the 14:
// contains, may contain, or not checked. It never says "free from".
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { ALLERGEN_SOURCES, ALLERGENS } from './db/schema'
import type { ChoiceGroup } from './choices'

export type Allergen = typeof ALLERGENS[number]
export interface AllergenAnswer { contains: Allergen[], mayContain: Allergen[], checked: boolean, checkedAt: number | null }

const keys = z.array(z.enum(ALLERGENS)).max(ALLERGENS.length)
export const allergenInput = z.object({ contains: keys, mayContain: keys, source: z.enum(ALLERGEN_SOURCES).default('label') }).strict()
  .refine(v => !v.contains.some(k => v.mayContain.includes(k)), { message: 'An allergen is either contained or may be contained, not both.', path: ['mayContain'] })
export type AllergenInput = z.infer<typeof allergenInput>

export type AllergenSubject = { productId: string } | { optionId: string } | { stockItemId: string }

const UNCHECKED: AllergenAnswer = { contains: [], mayContain: [], checked: false, checkedAt: null }
const ordered = (list: Allergen[]) => ALLERGENS.filter(k => list.includes(k))

export async function allergenSettings(): Promise<{ enabled: boolean, statement: string | null, recheckSeconds: number, publish: boolean }> {
  const statement = (await useSetting('bar.allergens.statement') as string).trim()
  return {
    enabled: await useSetting('bar.allergens.enabled') as boolean,
    statement: statement || null,
    recheckSeconds: await useSetting('bar.allergens.recheck-every') as number,
    publish: await useSetting('bar.allergens.publish') as boolean,
  }
}

export interface AllergenAnswers { products: Map<string, AllergenAnswer>, options: Map<string, AllergenAnswer>, stockItems: Map<string, AllergenAnswer> }

/** Every recorded answer, by product, option and stock item. A subject with no check is absent: read it as not checked. */
export async function allergenAnswers(): Promise<AllergenAnswers> {
  const checks = await all<{ product_id: string | null, option_id: string | null, stock_item_id: string | null, at: number }>(
    `SELECT product_id, option_id, NULL AS stock_item_id, max(at) AS at FROM bar_allergen_checks GROUP BY product_id, option_id
     UNION ALL SELECT NULL, NULL, stock_item_id, max(at) FROM bar_stock_item_allergen_checks GROUP BY stock_item_id`,
  )
  const entries = await all<{ product_id: string | null, option_id: string | null, stock_item_id: string | null, allergen: Allergen, level: 'contains' | 'may_contain' }>(
    'SELECT product_id, option_id, stock_item_id, allergen, level FROM bar_allergen_entries',
  )
  const answers: AllergenAnswers = { products: new Map(), options: new Map(), stockItems: new Map() }
  const mapOf = (r: { product_id: string | null, option_id: string | null }) => (r.product_id ? answers.products : r.option_id ? answers.options : answers.stockItems)
  const keyOf = (r: { product_id: string | null, option_id: string | null, stock_item_id: string | null }) => (r.product_id ?? r.option_id ?? r.stock_item_id)!
  for (const c of checks) mapOf(c).set(keyOf(c), { contains: [], mayContain: [], checked: true, checkedAt: c.at })
  for (const e of entries) {
    const answer = mapOf(e).get(keyOf(e))
    // Entries without a check cannot be written by the service; if one appears, it stays not checked.
    if (!answer) continue
    ;(e.level === 'contains' ? answer.contains : answer.mayContain).push(e.allergen)
  }
  for (const m of [answers.products, answers.options, answers.stockItems]) {
    for (const a of m.values()) {
      a.contains = ordered(a.contains)
      a.mayContain = ordered(a.mayContain)
    }
  }
  return answers
}

/** Which stock items each size's recipe names (its fixed lines), and each option's own stock item. */
export interface StockLinks { recipes: Map<string, string[]>, optionStock: Map<string, string>, choiceOnly: Set<string> }
export async function stockLinks(): Promise<StockLinks> {
  const recipes = new Map<string, string[]>()
  for (const r of await all<{ variant_id: string, stock_item_id: string }>('SELECT variant_id, stock_item_id FROM bar_recipe_lines WHERE stock_item_id IS NOT NULL ORDER BY position, id'))
    recipes.set(r.variant_id, [...recipes.get(r.variant_id) ?? [], r.stock_item_id])
  const optionStock = new Map((await all<{ id: string, stock_item_id: string }>('SELECT id, stock_item_id FROM bar_choice_options WHERE stock_item_id IS NOT NULL')).map(o => [o.id, o.stock_item_id] as const))
  // Sizes whose recipe is nothing but choice slots (a spirit and mixer): they have no label of their
  // own, so their answer is whatever is picked.
  const choiceOnly = new Set((await all<{ variant_id: string }>('SELECT variant_id FROM bar_recipe_lines GROUP BY variant_id HAVING max(stock_item_id IS NOT NULL) = 0')).map(r => r.variant_id))
  return { recipes, optionStock, choiceOnly }
}

/** What several stock items add up to: anything any contains, and checked only when all are (the oldest check counts). */
export function combine(parts: (AllergenAnswer | undefined)[]): AllergenAnswer {
  const contains = new Set<Allergen>()
  const mayContain = new Set<Allergen>()
  let checked = true
  let checkedAt: number | null = null
  for (const a of parts) {
    if (!a?.checked) checked = false
    else checkedAt = checkedAt === null ? a.checkedAt : Math.min(checkedAt, a.checkedAt ?? checkedAt)
    for (const k of a?.contains ?? []) contains.add(k)
    for (const k of a?.mayContain ?? []) mayContain.add(k)
  }
  const c = ordered([...contains])
  return { contains: c, mayContain: ordered([...mayContain].filter(k => !contains.has(k))), checked, checkedAt: checked ? checkedAt : null }
}

/**
 * A size's answer: worked out from the stock items its recipe names, or the product's own when it has
 * none. A size made only from choices has nothing of its own to check: its options answer for it.
 */
export function sizeAnswer(answers: AllergenAnswers, links: StockLinks, variantId: string, productId: string): AllergenAnswer | undefined {
  const items = links.recipes.get(variantId)
  if (items?.length) return combine(items.map(i => answers.stockItems.get(i)))
  return answers.products.get(productId) ?? (links.choiceOnly?.has(variantId) ? combine([]) : undefined)
}

/** An option's answer: its stock item's when it has one, otherwise its own. */
export function optionAnswer(answers: AllergenAnswers, links: StockLinks, optionId: string): AllergenAnswer | undefined {
  const item = links.optionStock.get(optionId)
  return item ? answers.stockItems.get(item) : answers.options.get(optionId)
}

export async function answerFor(subject: AllergenSubject): Promise<AllergenAnswer> {
  const { products, options, stockItems } = await allergenAnswers()
  return ('productId' in subject ? products.get(subject.productId) : 'optionId' in subject ? options.get(subject.optionId) : stockItems.get(subject.stockItemId)) ?? UNCHECKED
}

/**
 * Records what the label says, replacing what was listed, and logs the check. Recording the same
 * answer again is a check too: it is how a label is confirmed unchanged when it is due.
 */
export async function recordAllergens(unit: UnitView, subject: AllergenSubject, input: AllergenInput, by: string): Promise<void> {
  const productId = 'productId' in subject ? subject.productId : null
  const optionId = 'optionId' in subject ? subject.optionId : null
  const stockItemId = 'stockItemId' in subject ? subject.stockItemId : null
  const [table, column, id] = productId ? ['bar_products', 'product_id', productId] : optionId ? ['bar_choice_options', 'option_id', optionId] : ['bar_stock_items', 'stock_item_id', stockItemId!]
  if (!await first(`SELECT 1 FROM ${table} WHERE id = ?`, id)) refuse('bar.allergens.unknown', 'That product, option or stock item does not exist.', { status: 404 })
  const before = await answerFor(subject)
  const contains = ordered(input.contains)
  const mayContain = ordered(input.mayContain)
  const at = nowMs()
  unit.add({ sql: `DELETE FROM bar_allergen_entries WHERE ${column} = ?`, params: [id] })
  for (const [list, level] of [[contains, 'contains'], [mayContain, 'may_contain']] as const) {
    for (const allergen of list) {
      unit.add({
        sql: 'INSERT INTO bar_allergen_entries (id, product_id, option_id, stock_item_id, allergen, level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [newId('bale'), productId, optionId, stockItemId, allergen, level, at],
      })
    }
  }
  if (stockItemId) {
    unit.add({
      sql: 'INSERT INTO bar_stock_item_allergen_checks (id, stock_item_id, source, contains, may_contain, by, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [newId('bsac'), stockItemId, input.source, contains.join(','), mayContain.join(','), by, at, at],
    })
  }
  else {
    unit.add({
      sql: 'INSERT INTO bar_allergen_checks (id, product_id, option_id, source, contains, may_contain, by, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [newId('balc'), productId, optionId, input.source, contains.join(','), mayContain.join(','), by, at, at],
    })
  }
  unit.audit({
    action: 'update',
    record: productId
      ? ['bar.product', id]
      : optionId
        ? ['bar.choice-group', (await first<{ group_id: string }>('SELECT group_id FROM bar_choice_options WHERE id = ?', id))!.group_id]
        : ['bar.stock-item', id],
    detail: {
      ...(optionId ? { option: optionId } : {}),
      allergensChecked: before.checked,
      containsBefore: before.contains,
      mayContainBefore: before.mayContain,
      contains,
      mayContain,
      source: input.source,
    },
  })
}

/** The checks on a product, option or stock item, newest first, for its history. */
export async function allergenHistory(subject: AllergenSubject): Promise<{ at: number, by: string | null, source: string, contains: Allergen[], mayContain: Allergen[] }[]> {
  const [table, column, id] = 'productId' in subject
    ? ['bar_allergen_checks', 'product_id', subject.productId]
    : 'optionId' in subject ? ['bar_allergen_checks', 'option_id', subject.optionId] : ['bar_stock_item_allergen_checks', 'stock_item_id', subject.stockItemId]
  const rows = await all<{ at: number, by: string | null, source: string, contains: string, may_contain: string }>(
    `SELECT at, by, source, contains, may_contain FROM ${table} WHERE ${column} = ? ORDER BY at DESC, id DESC`, id,
  )
  const split = (s: string) => (s ? s.split(',') : []) as Allergen[]
  return rows.map(r => ({ at: r.at, by: r.by, source: r.source, contains: split(r.contains), mayContain: split(r.may_contain) }))
}

export interface OptionAllergens { contains: Allergen[], mayContain: Allergen[], checked: boolean }
export interface ItemAllergens extends OptionAllergens { dependsOnChoice: boolean }

const plain = (a: AllergenAnswer | undefined): OptionAllergens => ({ contains: a?.contains ?? [], mayContain: a?.mayContain ?? [], checked: !!a?.checked })

/**
 * The till's answers: each option's own (a mixer's are its size's), and each size's, marked as depending
 * on the choice when any option it offers lists something or is not checked. Sizes made from stock work
 * theirs out from the items their recipes name.
 */
export function tillAllergens(
  answers: AllergenAnswers,
  links: StockLinks,
  groups: ChoiceGroup[],
  productOfVariant: Map<string, string>,
): { option: (groupId: string, key: string) => OptionAllergens, size: (productId: string, variantId: string, groupIds: string[]) => ItemAllergens } {
  const byOption = new Map<string, OptionAllergens>()
  const varies = new Map<string, boolean>()
  for (const g of groups) {
    let groupVaries = false
    for (const o of g.options) {
      const answer = plain(o.mixerVariantId
        ? sizeAnswer(answers, links, o.mixerVariantId, productOfVariant.get(o.mixerVariantId) ?? '')
        : optionAnswer(answers, links, o.optionId ?? ''))
      byOption.set(`${g.id}:${o.key}`, answer)
      if (!answer.checked || answer.contains.length || answer.mayContain.length) groupVaries = true
    }
    varies.set(g.id, groupVaries)
  }
  return {
    option: (groupId, key) => byOption.get(`${groupId}:${key}`) ?? plain(undefined),
    size: (productId, variantId, groupIds) => ({ ...plain(sizeAnswer(answers, links, variantId, productId)), dependsOnChoice: groupIds.some(id => varies.get(id)) }),
  }
}
