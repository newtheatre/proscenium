// Allergens (Bar specification, tab 10; build step 1): recorded from the label on each product, and on
// each choice option that brings its own, with every check kept. The till gives one of three answers
// for each of the 14: contains, may contain, or not checked. It never says "free from".
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

export type AllergenSubject = { productId: string } | { optionId: string }

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

/** Every recorded answer, by product and by option. A subject with no check is absent: read it as not checked. */
export async function allergenAnswers(): Promise<{ products: Map<string, AllergenAnswer>, options: Map<string, AllergenAnswer> }> {
  const checks = await all<{ product_id: string | null, option_id: string | null, at: number }>(
    'SELECT product_id, option_id, max(at) AS at FROM bar_allergen_checks GROUP BY product_id, option_id',
  )
  const entries = await all<{ product_id: string | null, option_id: string | null, allergen: Allergen, level: 'contains' | 'may_contain' }>(
    'SELECT product_id, option_id, allergen, level FROM bar_allergen_entries',
  )
  const products = new Map<string, AllergenAnswer>()
  const options = new Map<string, AllergenAnswer>()
  const mapOf = (r: { product_id: string | null }) => (r.product_id ? products : options)
  const keyOf = (r: { product_id: string | null, option_id: string | null }) => (r.product_id ?? r.option_id)!
  for (const c of checks) mapOf(c).set(keyOf(c), { contains: [], mayContain: [], checked: true, checkedAt: c.at })
  for (const e of entries) {
    const answer = mapOf(e).get(keyOf(e))
    // Entries without a check cannot be written by the service; if one appears, it stays not checked.
    if (!answer) continue
    ;(e.level === 'contains' ? answer.contains : answer.mayContain).push(e.allergen)
  }
  for (const m of [products, options]) {
    for (const a of m.values()) {
      a.contains = ordered(a.contains)
      a.mayContain = ordered(a.mayContain)
    }
  }
  return { products, options }
}

export async function answerFor(subject: AllergenSubject): Promise<AllergenAnswer> {
  const { products, options } = await allergenAnswers()
  return ('productId' in subject ? products.get(subject.productId) : options.get(subject.optionId)) ?? UNCHECKED
}

/**
 * Records what the label says, replacing what was listed, and logs the check. Recording the same
 * answer again is a check too: it is how a label is confirmed unchanged when it is due.
 */
export async function recordAllergens(unit: UnitView, subject: AllergenSubject, input: AllergenInput, by: string): Promise<void> {
  const productId = 'productId' in subject ? subject.productId : null
  const optionId = 'optionId' in subject ? subject.optionId : null
  const table = productId ? 'bar_products' : 'bar_choice_options'
  const id = (productId ?? optionId)!
  if (!await first(`SELECT 1 FROM ${table} WHERE id = ?`, id)) refuse('bar.allergens.unknown', 'That product or option does not exist.', { status: 404 })
  const before = await answerFor(subject)
  const contains = ordered(input.contains)
  const mayContain = ordered(input.mayContain)
  const at = nowMs()
  const column = productId ? 'product_id' : 'option_id'
  unit.add({ sql: `DELETE FROM bar_allergen_entries WHERE ${column} = ?`, params: [id] })
  for (const [list, level] of [[contains, 'contains'], [mayContain, 'may_contain']] as const) {
    for (const allergen of list) {
      unit.add({
        sql: 'INSERT INTO bar_allergen_entries (id, product_id, option_id, allergen, level, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [newId('bale'), productId, optionId, allergen, level, at],
      })
    }
  }
  unit.add({
    sql: 'INSERT INTO bar_allergen_checks (id, product_id, option_id, source, contains, may_contain, by, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('balc'), productId, optionId, input.source, contains.join(','), mayContain.join(','), by, at, at],
  })
  unit.audit({
    action: 'update',
    record: productId ? ['bar.product', id] : ['bar.choice-group', (await first<{ group_id: string }>('SELECT group_id FROM bar_choice_options WHERE id = ?', id))!.group_id],
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

/** The checks on a product or option, newest first, for its history. */
export async function allergenHistory(subject: AllergenSubject): Promise<{ at: number, by: string | null, source: string, contains: Allergen[], mayContain: Allergen[] }[]> {
  const [column, id] = 'productId' in subject ? ['product_id', subject.productId] : ['option_id', subject.optionId]
  const rows = await all<{ at: number, by: string | null, source: string, contains: string, may_contain: string }>(
    `SELECT at, by, source, contains, may_contain FROM bar_allergen_checks WHERE ${column} = ? ORDER BY at DESC, id DESC`, id,
  )
  const split = (s: string) => (s ? s.split(',') : []) as Allergen[]
  return rows.map(r => ({ at: r.at, by: r.by, source: r.source, contains: split(r.contains), mayContain: split(r.may_contain) }))
}

export interface OptionAllergens { contains: Allergen[], mayContain: Allergen[], checked: boolean }
export interface ItemAllergens extends OptionAllergens { dependsOnChoice: boolean }

const plain = (a: AllergenAnswer | undefined): OptionAllergens => ({ contains: a?.contains ?? [], mayContain: a?.mayContain ?? [], checked: !!a?.checked })

/**
 * The till's answers: each option's own (a mixer's are its product's), and each product's, marked as
 * depending on the choice when any option it offers lists something or is not checked.
 */
export function tillAllergens(
  answers: { products: Map<string, AllergenAnswer>, options: Map<string, AllergenAnswer> },
  groups: ChoiceGroup[],
  productOfVariant: Map<string, string>,
): { option: (groupId: string, key: string) => OptionAllergens, product: (productId: string, groupIds: string[]) => ItemAllergens } {
  const byOption = new Map<string, OptionAllergens>()
  const varies = new Map<string, boolean>()
  for (const g of groups) {
    let groupVaries = false
    for (const o of g.options) {
      const answer = plain(o.mixerVariantId ? answers.products.get(productOfVariant.get(o.mixerVariantId) ?? '') : answers.options.get(o.optionId ?? ''))
      byOption.set(`${g.id}:${o.key}`, answer)
      if (!answer.checked || answer.contains.length || answer.mayContain.length) groupVaries = true
    }
    varies.set(g.id, groupVaries)
  }
  return {
    option: (groupId, key) => byOption.get(`${groupId}:${key}`) ?? plain(undefined),
    product: (productId, groupIds) => ({ ...plain(answers.products.get(productId)), dependsOnChoice: groupIds.some(id => varies.get(id)) }),
  }
}
