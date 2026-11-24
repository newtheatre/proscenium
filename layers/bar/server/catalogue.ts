// The bar's catalogue (tab 2, "What is sold"; tab 3, "Price lists"): categories, products and their
// variants, price lists and prices, and outlets. Every write is one unit; a name already in use and a
// record that has gone are refused by the statement itself, never by a read first.
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { listTaxCodes } from '#modules/finance'
import { priceOn, nextChange, type ListRule, type PriceRow } from './pricing'
import type { OUTLET_KINDS, TILL_LAYOUTS } from './db/schema'
import { choiceGroups, groupsByProduct, priceGroups, type ChoiceGroup } from './choices'
import { allergenAnswers, allergenSettings, stockLinks, tillAllergens, type ItemAllergens, type OptionAllergens } from './allergens'

export const STANDARD = 'standard'

const NAME_TAKEN = (what: string) => ({ code: 'bar.name-taken', reason: `There is already ${what} with that name.`, remedy: 'Choose another name.' })
const GONE = (what: string) => ({ code: 'core.not-found', reason: `There is no such ${what}.` })

/** Makes Standard if it is not there. One statement, safe to repeat. */
export function ensureStandard(unit: UnitView): void {
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_price_lists (id, name, system_key, restricted, falls_back, active, created_at, updated_at)
          SELECT ?, 'Standard', 'standard', 0, 1, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_price_lists WHERE system_key = 'standard')`,
    params: [newId('bpls'), at, at],
  })
}

/** Standard's id, or null before the bar has ever been switched on. */
export async function standardId(): Promise<string | null> {
  return (await first<{ id: string }>("SELECT id FROM bar_price_lists WHERE system_key = 'standard'"))?.id ?? null
}

const currency = async () => await useSetting('core.locale.currency') as string

// ---- Reading -------------------------------------------------------------------------------------

export interface PriceList { id: string, name: string, standard: boolean, restricted: boolean, fallsBack: boolean, active: boolean }
export interface VariantPrice { listId: string, amountMinor: number | null, from: 'list' | 'standard' | null, next: { amountMinor: number | null, from: number } | null }
export interface Variant { id: string, name: string, barcode: string | null, mixerMeasure: boolean, position: number, active: boolean, prices: VariantPrice[] }
export interface Product { id: string, categoryId: string, name: string, ageRestricted: boolean, ageFromCategory: boolean, taxCode: string | null, position: number, active: boolean, groupIds: string[], variants: Variant[] }
export interface Category { id: string, name: string, position: number, colour: string | null, parentId: string | null, ageRestricted: boolean, usualPreset: string | null, active: boolean, products: Product[] }

interface ListRow { id: string, name: string, system_key: string | null, restricted: number, falls_back: number, active: number }

const shapeList = (r: ListRow): PriceList => ({ id: r.id, name: r.name, standard: r.system_key === STANDARD, restricted: !!r.restricted, fallsBack: !!r.falls_back, active: !!r.active })

/** Every price list, Standard first. */
export async function priceLists(): Promise<PriceList[]> {
  const rows = await all<ListRow>("SELECT id, name, system_key, restricted, falls_back, active FROM bar_price_lists ORDER BY system_key = 'standard' DESC, active DESC, lower(name), id")
  return rows.map(shapeList)
}

async function priceRows(variantIds?: string[]): Promise<PriceRow[]> {
  const where = variantIds ? 'WHERE variant_id IN (SELECT value FROM json_each(?))' : ''
  return await all<PriceRow>(`SELECT id, variant_id AS variantId, price_list_id AS priceListId, amount_minor AS amountMinor, effective_from AS effectiveFrom FROM bar_prices ${where}`, ...(variantIds ? [JSON.stringify(variantIds)] : []))
}

const rule = (l: PriceList): ListRule => ({ id: l.id, fallsBack: l.fallsBack })

/** The whole catalogue, with each variant's price in force on every list and any change planned. */
export async function catalogue(options: { activeOnly?: boolean } = {}): Promise<{ categories: Category[], lists: PriceList[], currency: string }> {
  const active = options.activeOnly ? 'WHERE active = 1' : ''
  const cats = await all<{ id: string, name: string, position: number, colour: string | null, parent_id: string | null, age_restricted: number, usual_preset: string | null, active: number }>(`SELECT id, name, position, colour, parent_id, age_restricted, usual_preset, active FROM bar_categories ${active} ORDER BY position, lower(name), id`)
  const prods = await all<{ id: string, category_id: string, name: string, age_restricted: number, age_from_category: number, tax_code: string | null, position: number, active: number }>(`SELECT p.id, p.category_id, p.name, (CASE WHEN p.age_from_category = 1 THEN c.age_restricted ELSE p.age_restricted END) AS age_restricted, p.age_from_category, p.tax_code, p.position, p.active FROM bar_products p JOIN bar_categories c ON c.id = p.category_id ${options.activeOnly ? 'WHERE p.active = 1' : ''} ORDER BY p.position, lower(p.name), p.id`)
  const vars = await all<{ id: string, product_id: string, name: string, barcode: string | null, mixer_measure: number, position: number, active: number }>(`SELECT id, product_id, name, barcode, mixer_measure, position, active FROM bar_variants ${active} ORDER BY position, id`)
  const attached = await groupsByProduct()
  const lists = await priceLists()
  const std = lists.find(l => l.standard)?.id ?? ''
  const rows = await priceRows()
  const at = nowMs()
  const variantsOf = new Map<string, Variant[]>()
  for (const v of vars) {
    const prices = lists.map((l): VariantPrice => {
      const priced = priceOn(rows, v.id, rule(l), std, at)
      const next = nextChange(rows, v.id, l.id, at)
      return { listId: l.id, amountMinor: priced?.amountMinor ?? null, from: priced?.from ?? null, next: next ? { amountMinor: next.amountMinor, from: next.effectiveFrom } : null }
    })
    const list = variantsOf.get(v.product_id) ?? []
    list.push({ id: v.id, name: v.name, barcode: v.barcode, mixerMeasure: !!v.mixer_measure, position: v.position, active: !!v.active, prices })
    variantsOf.set(v.product_id, list)
  }
  const productsOf = new Map<string, Product[]>()
  for (const p of prods) {
    const list = productsOf.get(p.category_id) ?? []
    list.push({ id: p.id, categoryId: p.category_id, name: p.name, ageRestricted: !!p.age_restricted, ageFromCategory: !!p.age_from_category, taxCode: p.tax_code, position: p.position, active: !!p.active, groupIds: attached.get(p.id) ?? [], variants: variantsOf.get(p.id) ?? [] })
    productsOf.set(p.category_id, list)
  }
  return {
    categories: cats.map(c => ({ id: c.id, name: c.name, position: c.position, colour: c.colour, parentId: c.parent_id, ageRestricted: !!c.age_restricted, usualPreset: c.usual_preset, active: !!c.active, products: productsOf.get(c.id) ?? [] })),
    lists,
    currency: await currency(),
  }
}

export interface MenuItem { variantId: string, productId: string, product: string, variant: string, ageRestricted: boolean, amountMinor: number, priceId: string, groupIds: string[], baseMinor: number, allergens?: ItemAllergens }
export interface Menu {
  outletId: string
  outlet: string
  // How this outlet's till shows its categories, and the sizes pinned to its front, in order.
  tillLayout: TillLayout
  favourites: string[]
  priceListId: string
  priceList: string
  currency: string
  categories: { id: string, name: string, colour: string | null, parentId: string | null, items: MenuItem[] }[]
  // Each option carries allergens too while they are switched on.
  groups: (ChoiceGroup & { options: (ChoiceGroup['options'][number] & { allergens?: OptionAllergens })[] })[]
  // The theatre's statement about shared equipment; null when it has none or allergens are off.
  allergenStatement: string | null
}

/**
 * What an outlet sells, at a list's prices (the outlet's own when none is named): every active
 * variant of every active product that has a price on that list. A variant with no price is left out.
 */
export async function menu(outletId: string, priceListId?: string): Promise<Menu> {
  const outlet = await first<{ id: string, name: string, price_list_id: string, till_layout: TillLayout, active: number }>('SELECT id, name, price_list_id, till_layout, active FROM bar_outlets WHERE id = ?', outletId)
  if (!outlet || !outlet.active) refuse('bar.outlet.unknown', 'That outlet is not selling.', { status: 404 })
  const lists = await priceLists()
  const list = lists.find(l => l.id === (priceListId ?? outlet!.price_list_id) && l.active)
  if (!list) refuse('bar.price-list.unknown', 'That price list is not in use.', { status: 404 })
  const std = lists.find(l => l.standard)?.id ?? ''
  const { categories } = await catalogue({ activeOnly: true })
  const rows = await priceRows()
  const at = nowMs()
  // Each option with what it adds. A line's unit price is its baseMinor (its amountMinor) plus its picks: the server's sum.
  const priced = priceGroups(await choiceGroups({ activeOnly: true }), (variantId) => {
    const found = priceOn(rows, variantId, rule(list!), std, at)
    return found ? found.amountMinor : null
  })
  // Allergens ride on the menu, so the till's sheet works from what it loaded. Left off when switched off.
  const allergenSet = await allergenSettings()
  const productOfVariant = new Map(categories.flatMap(c => c.products.flatMap(p => p.variants.map(v => [v.id, p.id] as const))))
  const al = allergenSet.enabled ? tillAllergens(await allergenAnswers(), await stockLinks(), priced, productOfVariant) : null
  return {
    outletId: outlet!.id,
    outlet: outlet!.name,
    tillLayout: outlet!.till_layout,
    favourites: (await all<{ variant_id: string }>('SELECT variant_id FROM bar_outlet_favourites WHERE outlet_id = ? ORDER BY position', outlet!.id)).map(f => f.variant_id),
    priceListId: list!.id,
    priceList: list!.name,
    currency: await currency(),
    categories: kept(categories.map(c => ({
      id: c.id,
      name: c.name,
      colour: c.colour,
      parentId: c.parentId,
      // A mixer measure is never on the grid: the Mixer choice offers it.
      items: c.products.flatMap(p => p.variants.filter(v => !v.mixerMeasure).flatMap((v) => {
        const priced = priceOn(rows, v.id, rule(list!), std, at)
        if (!priced) return []
        const base = priced.amountMinor
        return [{ variantId: v.id, productId: p.id, product: p.name, variant: v.name, ageRestricted: p.ageRestricted, amountMinor: priced.amountMinor, priceId: priced.priceId, groupIds: p.groupIds, baseMinor: base, ...(al ? { allergens: al.size(p.id, v.id, p.groupIds) } : {}) }]
      })),
    }))),
    groups: al ? priced.map(g => ({ ...g, options: g.options.map(o => ({ ...o, allergens: al.option(g.id, o.key) })) })) : priced,
    allergenStatement: al ? allergenSet.statement : null,
  }
}

/** The categories with something to sell, and every parent of one, so a sub-category is never orphaned. */
function kept<C extends { id: string, parentId: string | null, items: unknown[] }>(categories: C[]): C[] {
  const parents = new Set(categories.filter(c => c.items.length && c.parentId).map(c => c.parentId))
  return categories.filter(c => c.items.length || parents.has(c.id))
}

/** The price of each variant on a list now, for ringing up lines. Variants with no price are absent. */
export async function pricesFor(variantIds: string[], priceListId: string): Promise<Map<string, { amountMinor: number, priceId: string }>> {
  const lists = await priceLists()
  const list = lists.find(l => l.id === priceListId && l.active)
  const std = lists.find(l => l.standard)?.id ?? ''
  const out = new Map<string, { amountMinor: number, priceId: string }>()
  if (!list) return out
  const rows = await priceRows(variantIds)
  const at = nowMs()
  for (const id of variantIds) {
    const priced = priceOn(rows, id, rule(list), std, at)
    if (priced) out.set(id, { amountMinor: priced.amountMinor, priceId: priced.priceId })
  }
  return out
}

// ---- Categories, products and variants --------------------------------------------------------------

export interface CategoryInput { name: string, colour?: string | null, parentId?: string | null, ageRestricted?: boolean, usualPreset?: string | null, active?: boolean }

const PARENT_REFUSED = { code: 'bar.category.parent', reason: 'A sub-category sits under a top-level category, and a category with sub-categories cannot go under another.', remedy: 'Pick a top-level category, or none.' }
// The parent, when one is named, is a top-level category in use other than this one.
const PARENT_OK = '(? IS NULL OR EXISTS (SELECT 1 FROM bar_categories p WHERE p.id = ? AND p.parent_id IS NULL AND p.active = 1 AND p.id <> ?))'

/** Refuses a parent that is not a top-level category in use, or a move under one for a category that has sub-categories. */
export async function checkParent(id: string | null, parentId: string | null): Promise<void> {
  if (parentId === null) return
  const parent = await first<{ parent_id: string | null, active: number }>('SELECT parent_id, active FROM bar_categories WHERE id = ?', parentId)
  const hasChildren = id ? await first('SELECT 1 FROM bar_categories WHERE parent_id = ?', id) : null
  if (!parent || parent.parent_id !== null || !parent.active || parentId === id || hasChildren) refuse(PARENT_REFUSED.code, PARENT_REFUSED.reason, { remedy: PARENT_REFUSED.remedy })
}

/** A category. With a parent, call checkParent first for a clear refusal; the insert still guards it. */
export function addCategory(unit: UnitView, input: CategoryInput): string {
  const id = newId('bcat')
  const at = nowMs()
  const parentId = input.parentId ?? null
  unit.add({
    sql: `INSERT INTO bar_categories (id, name, position, colour, parent_id, age_restricted, usual_preset, active, created_at, updated_at)
          SELECT ?, ?, coalesce((SELECT max(position) + 1 FROM bar_categories), 0), ?, ?, ?, ?, 1, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM bar_categories WHERE lower(name) = lower(?)) AND ${PARENT_OK}`,
    params: [id, input.name, input.colour ?? null, parentId, input.ageRestricted ? 1 : 0, input.usualPreset ?? null, at, at, input.name, parentId, parentId, id],
  }).expect(1, NAME_TAKEN('a category'))
  unit.audit({ action: 'create', record: ['bar.category', id] })
  return id
}

export async function updateCategory(unit: UnitView, id: string, input: Partial<CategoryInput>): Promise<void> {
  const row = await first<{ name: string, colour: string | null, parent_id: string | null, age_restricted: number, usual_preset: string | null, active: number }>('SELECT name, colour, parent_id, age_restricted, usual_preset, active FROM bar_categories WHERE id = ?', id)
  if (!row) refuse(GONE('category').code, GONE('category').reason, { status: 404 })
  const name = input.name ?? row!.name
  const parentId = input.parentId === undefined ? row!.parent_id : input.parentId
  if (parentId !== row!.parent_id) await checkParent(id, parentId)
  const moved = parentId !== row!.parent_id
  unit.add({
    sql: `UPDATE bar_categories SET name = ?, colour = ?, parent_id = ?, age_restricted = ?, usual_preset = ?, active = ?, updated_at = ?
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_categories WHERE lower(name) = lower(?) AND id <> ?)
          AND (? = 0 OR (${PARENT_OK} AND NOT EXISTS (SELECT 1 FROM bar_categories c WHERE c.parent_id = ?)))`,
    params: [
      name, input.colour === undefined ? row!.colour : input.colour, parentId,
      input.ageRestricted === undefined ? row!.age_restricted : input.ageRestricted ? 1 : 0,
      input.usualPreset === undefined ? row!.usual_preset : input.usualPreset,
      input.active === undefined ? row!.active : input.active ? 1 : 0, nowMs(), id, name, id, moved ? 1 : 0, parentId, parentId, id, id,
    ],
  }).expect(1, NAME_TAKEN('a category'))
  unit.audit({ action: 'update', record: ['bar.category', id] })
}

// ageRestricted null: as the category, which a change to the category then follows.
export interface ProductInput { categoryId: string, name: string, ageRestricted?: boolean | null, taxCode?: string | null, active?: boolean }
export interface FirstVariant { name?: string, amountMinor?: number | null }

/** A product with its first variant ("Each" unless named), and that variant's Standard price if given. */
export async function addProduct(unit: UnitView, input: ProductInput, first: FirstVariant, by: string): Promise<{ productId: string, variantId: string }> {
  ensureStandard(unit)
  if (input.taxCode) await knownTaxCode(input.taxCode)
  const productId = newId('bprd')
  const variantId = newId('bvar')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_products (id, category_id, name, age_restricted, age_from_category, tax_code, position, active, created_at, updated_at)
          SELECT ?, id, ?, ?, ?, ?, coalesce((SELECT max(position) + 1 FROM bar_products WHERE category_id = ?), 0), 1, ?, ? FROM bar_categories WHERE id = ? AND active = 1`,
    params: [productId, input.name, input.ageRestricted ? 1 : 0, input.ageRestricted === null ? 1 : 0, input.taxCode ?? null, input.categoryId, at, at, input.categoryId],
  }).expect(1, { code: 'bar.category.unknown', reason: 'That category is not in use.' })
  unit.add({
    sql: 'INSERT INTO bar_variants (id, product_id, name, position, active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)',
    params: [variantId, productId, first.name?.trim() || 'Each', at, at],
  })
  if (first.amountMinor !== undefined && first.amountMinor !== null) await setPrice(unit, { variantId, priceListId: null, amountMinor: first.amountMinor }, by)
  unit.audit({ action: 'create', record: ['bar.product', productId] })
  return { productId, variantId }
}

/** A code a product may be given: one Finance offers now. */
async function knownTaxCode(code: string): Promise<void> {
  if (!(await listTaxCodes({ activeOnly: true })).some(c => c.code === code && c.code !== 'none'))
    refuse('bar.product.tax-code', 'That tax code is not offered.', { status: 422, remedy: 'Choose a code from the list.', fields: { taxCode: 'bar.product.tax-code' } })
}

export async function updateProduct(unit: UnitView, id: string, input: Partial<ProductInput>): Promise<void> {
  const row = await first<{ category_id: string, name: string, age_restricted: number, age_from_category: number, tax_code: string | null, active: number }>('SELECT category_id, name, age_restricted, age_from_category, tax_code, active FROM bar_products WHERE id = ?', id)
  if (!row) refuse(GONE('product').code, GONE('product').reason, { status: 404 })
  if (input.taxCode && input.taxCode !== row!.tax_code) await knownTaxCode(input.taxCode)
  const categoryId = input.categoryId ?? row!.category_id
  unit.add({
    sql: `UPDATE bar_products SET category_id = ?, name = ?, age_restricted = ?, age_from_category = ?, tax_code = ?, active = ?, updated_at = ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM bar_categories WHERE id = ? AND (active = 1 OR id = ?))`,
    params: [
      categoryId, input.name ?? row!.name,
      input.ageRestricted === undefined ? row!.age_restricted : input.ageRestricted ? 1 : 0,
      input.ageRestricted === undefined ? row!.age_from_category : input.ageRestricted === null ? 1 : 0,
      input.taxCode === undefined ? row!.tax_code : input.taxCode,
      input.active === undefined ? row!.active : input.active ? 1 : 0, nowMs(), id, categoryId, row!.category_id,
    ],
  }).expect(1, { code: 'bar.category.unknown', reason: 'That category is not in use.' })
  unit.audit({ action: 'update', record: ['bar.product', id] })
}

/** Moves a product within its category: one place up or down, or to a place counted from nought (a drag). */
export async function moveProduct(unit: UnitView, id: string, move: { direction: 'up' | 'down' } | { to: number }): Promise<void> {
  const row = await first<{ category_id: string }>('SELECT category_id FROM bar_products WHERE id = ?', id)
  if (!row) refuse(GONE('product').code, GONE('product').reason, { status: 404 })
  const order = await all<{ id: string }>('SELECT id FROM bar_products WHERE category_id = ? ORDER BY position, lower(name), id', row!.category_id)
  const ids = order.map(r => r.id)
  const from = ids.indexOf(id)
  // A place past the end is the end, so a list that grew since the screen loaded still takes the drop.
  const to = 'to' in move ? Math.min(move.to, ids.length - 1) : move.direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= ids.length || to === from) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  unit.add({
    sql: 'UPDATE bar_products SET position = (SELECT key FROM json_each(?) WHERE value = bar_products.id), updated_at = ? WHERE category_id = ?',
    params: [JSON.stringify(ids), nowMs(), row!.category_id],
  })
  unit.audit({ action: 'update', record: ['bar.product', id], detail: { moved: 'to' in move ? to : move.direction } })
}

export interface VariantInput { name: string, barcode?: string | null, active?: boolean }

export async function addVariant(unit: UnitView, productId: string, input: VariantInput, amountMinor: number | null | undefined, by: string): Promise<string> {
  const id = newId('bvar')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_variants (id, product_id, name, barcode, position, active, created_at, updated_at)
          SELECT ?, id, ?, ?, coalesce((SELECT max(position) + 1 FROM bar_variants WHERE product_id = ?), 0), 1, ?, ? FROM bar_products
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_variants WHERE product_id = ? AND lower(name) = lower(?))`,
    params: [id, input.name, input.barcode ?? null, productId, at, at, productId, productId, input.name],
  }).expect(1, NAME_TAKEN('a size of this product'))
  if (amountMinor !== undefined && amountMinor !== null) await setPrice(unit, { variantId: id, priceListId: null, amountMinor }, by)
  unit.audit({ action: 'update', record: ['bar.product', productId], detail: { variantAdded: id } })
  return id
}

export async function updateVariant(unit: UnitView, id: string, input: Partial<VariantInput>): Promise<void> {
  const row = await first<{ product_id: string, name: string, barcode: string | null, active: number }>('SELECT product_id, name, barcode, active FROM bar_variants WHERE id = ?', id)
  if (!row) refuse(GONE('size').code, GONE('size').reason, { status: 404 })
  const name = input.name ?? row!.name
  const active = input.active === undefined ? !!row!.active : input.active
  // A product keeps at least one size on sale while it is itself on sale.
  const keepsOne = active ? '' : 'AND (EXISTS (SELECT 1 FROM bar_variants WHERE product_id = ? AND id <> ? AND active = 1) OR EXISTS (SELECT 1 FROM bar_products WHERE id = ? AND active = 0))'
  unit.add({
    sql: `UPDATE bar_variants SET name = ?, barcode = ?, active = ?, updated_at = ?
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_variants WHERE product_id = ? AND lower(name) = lower(?) AND id <> ?) ${keepsOne}`,
    params: [name, input.barcode === undefined ? row!.barcode : input.barcode, active ? 1 : 0, nowMs(), id, row!.product_id, name, id, ...(active ? [] : [row!.product_id, id, row!.product_id])],
  }).expect(1, active ? NAME_TAKEN('a size of this product') : { code: 'bar.variant.last', reason: 'A product on sale keeps at least one size.', remedy: 'Retire the product instead.' })
  unit.audit({ action: 'update', record: ['bar.product', row!.product_id], detail: { variantChanged: id } })
}

// ---- Prices and price lists -----------------------------------------------------------------------

export interface PriceInput { variantId: string, priceListId: string | null, amountMinor: number | null, effectiveFrom?: number }

/**
 * A new price for a variant on a list (Standard when none is named), from now or a later moment. A
 * null amount withdraws it.
 */
export async function setPrice(unit: UnitView, input: PriceInput, by: string): Promise<string> {
  ensureStandard(unit)
  const id = newId('bprc')
  const at = nowMs()
  const from = Math.max(input.effectiveFrom ?? at, at)
  const list = input.priceListId === null ? "(SELECT id FROM bar_price_lists WHERE system_key = 'standard')" : '?'
  unit.add({
    sql: `INSERT INTO bar_prices (id, variant_id, price_list_id, amount_minor, currency, effective_from, set_by, created_at)
          SELECT ?, v.id, l.id, ?, ?, ?, ?, ? FROM bar_variants v, bar_price_lists l
          WHERE v.id = ? AND l.id = ${list} AND l.active = 1`,
    params: [id, input.amountMinor, await currency(), from, by, at, input.variantId, ...(input.priceListId === null ? [] : [input.priceListId])],
  }).expect(1, { code: 'bar.price.not-settable', reason: 'That list is not in use, or the size is not there.', remedy: 'Choose a list in use.' })
  unit.audit({ action: 'create', record: ['bar.price-list', input.priceListId ?? 'standard'], detail: { variantId: input.variantId, amountMinor: input.amountMinor, effectiveFrom: from } })
  return id
}

export interface PriceListInput { name: string, restricted?: boolean, fallsBack?: boolean, active?: boolean }

export function addPriceList(unit: UnitView, input: PriceListInput): string {
  ensureStandard(unit)
  const id = newId('bpls')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_price_lists (id, name, system_key, restricted, falls_back, active, created_at, updated_at)
          SELECT ?, ?, NULL, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_price_lists WHERE lower(name) = lower(?))`,
    params: [id, input.name, input.restricted ? 1 : 0, input.fallsBack === false ? 0 : 1, at, at, input.name],
  }).expect(1, NAME_TAKEN('a price list'))
  unit.audit({ action: 'create', record: ['bar.price-list', id] })
  return id
}

/** Changes a list. Standard keeps its name's place and cannot be retired. */
export async function updatePriceList(unit: UnitView, id: string, input: Partial<PriceListInput>): Promise<void> {
  const row = await first<ListRow>('SELECT id, name, system_key, restricted, falls_back, active FROM bar_price_lists WHERE id = ?', id)
  if (!row) refuse(GONE('price list').code, GONE('price list').reason, { status: 404 })
  const standard = row!.system_key === STANDARD
  if (standard && input.active === false) refuse('bar.price-list.standard', 'Standard is always in use.', { status: 409 })
  const name = input.name ?? row!.name
  const active = input.active === undefined ? !!row!.active : input.active
  // A list an outlet sells from stays in use.
  const inUse = active ? '' : 'AND NOT EXISTS (SELECT 1 FROM bar_outlets WHERE price_list_id = ? AND active = 1)'
  unit.add({
    sql: `UPDATE bar_price_lists SET name = ?, restricted = ?, falls_back = ?, active = ?, updated_at = ?
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_price_lists WHERE lower(name) = lower(?) AND id <> ?) ${inUse}`,
    params: [name, input.restricted === undefined ? row!.restricted : input.restricted ? 1 : 0, input.fallsBack === undefined ? row!.falls_back : input.fallsBack ? 1 : 0, active ? 1 : 0, nowMs(), id, name, id, ...(active ? [] : [id])],
  }).expect(1, !active ? { code: 'bar.price-list.in-use', reason: 'An outlet sells from this list.', remedy: 'Give the outlet another list first.' } : NAME_TAKEN('a price list'))
  unit.audit({ action: 'update', record: ['bar.price-list', id] })
}

// ---- Outlets ---------------------------------------------------------------------------------------

export type OutletKind = typeof OUTLET_KINDS[number]
export type TillLayout = typeof TILL_LAYOUTS[number]
export interface Outlet { id: string, name: string, kind: OutletKind, priceListId: string, priceList: string, spaceId: string | null, stockLocationId: string | null, tillLayout: TillLayout, favourites: string[], active: boolean }
export interface OutletInput { name: string, kind: OutletKind, priceListId?: string | null, spaceId?: string | null, stockLocationId?: string | null, tillLayout?: TillLayout, active?: boolean }

export async function outlets(): Promise<Outlet[]> {
  const rows = await all<{ id: string, name: string, kind: OutletKind, price_list_id: string, list: string, space_id: string | null, stock_location_id: string | null, till_layout: TillLayout, active: number }>(
    'SELECT o.id, o.name, o.kind, o.price_list_id, l.name AS list, o.space_id, o.stock_location_id, o.till_layout, o.active FROM bar_outlets o JOIN bar_price_lists l ON l.id = o.price_list_id ORDER BY o.active DESC, lower(o.name), o.id',
  )
  const favourites = new Map<string, string[]>()
  for (const f of await all<{ outlet_id: string, variant_id: string }>('SELECT outlet_id, variant_id FROM bar_outlet_favourites ORDER BY outlet_id, position')) {
    favourites.set(f.outlet_id, [...favourites.get(f.outlet_id) ?? [], f.variant_id])
  }
  return rows.map(r => ({ id: r.id, name: r.name, kind: r.kind, priceListId: r.price_list_id, priceList: r.list, spaceId: r.space_id, stockLocationId: r.stock_location_id, tillLayout: r.till_layout, favourites: favourites.get(r.id) ?? [], active: !!r.active }))
}

const OUTLET_REFUSED = { code: 'bar.outlet.refused', reason: 'Another outlet in use has that name, the box office desk already has an outlet, or the price list or stock location is not in use.', remedy: 'Check the name, the kind and the list.' }

export function addOutlet(unit: UnitView, input: OutletInput): string {
  ensureStandard(unit)
  const id = newId('bout')
  const at = nowMs()
  const list = input.priceListId ? '?' : "(SELECT id FROM bar_price_lists WHERE system_key = 'standard')"
  unit.add({
    sql: `INSERT INTO bar_outlets (id, name, kind, price_list_id, space_id, stock_location_id, till_layout, active, created_at, updated_at)
          SELECT ?, ?, ?, l.id, ?, ?, ?, 1, ?, ? FROM bar_price_lists l WHERE l.id = ${list} AND l.active = 1
          AND (? IS NULL OR EXISTS (SELECT 1 FROM bar_stock_locations WHERE id = ? AND active = 1))
          AND NOT EXISTS (SELECT 1 FROM bar_outlets WHERE active = 1 AND (lower(name) = lower(?) OR (kind = 'desk' AND ? = 'desk')))`,
    params: [id, input.name, input.kind, input.spaceId ?? null, input.stockLocationId ?? null, input.tillLayout ?? 'chips', at, at, ...(input.priceListId ? [input.priceListId] : []), input.stockLocationId ?? null, input.stockLocationId ?? null, input.name, input.kind],
  }).expect(1, OUTLET_REFUSED)
  unit.audit({ action: 'create', record: ['bar.outlet', id] })
  return id
}

export async function updateOutlet(unit: UnitView, id: string, input: Partial<OutletInput>): Promise<void> {
  const row = await first<{ name: string, kind: OutletKind, price_list_id: string, space_id: string | null, stock_location_id: string | null, till_layout: TillLayout, active: number }>('SELECT name, kind, price_list_id, space_id, stock_location_id, till_layout, active FROM bar_outlets WHERE id = ?', id)
  if (!row) refuse(GONE('outlet').code, GONE('outlet').reason, { status: 404 })
  const name = input.name ?? row!.name
  const kind = input.kind ?? row!.kind
  const active = input.active === undefined ? !!row!.active : input.active
  const listId = input.priceListId ?? row!.price_list_id
  const locationId = input.stockLocationId === undefined ? row!.stock_location_id : input.stockLocationId
  unit.add({
    sql: `UPDATE bar_outlets SET name = ?, kind = ?, price_list_id = ?, space_id = ?, stock_location_id = ?, till_layout = ?, active = ?, updated_at = ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM bar_price_lists WHERE id = ? AND active = 1)
          AND (? IS NULL OR ? IS ? OR EXISTS (SELECT 1 FROM bar_stock_locations WHERE id = ? AND active = 1))
          AND (? = 0 OR NOT EXISTS (SELECT 1 FROM bar_outlets WHERE active = 1 AND id <> ? AND (lower(name) = lower(?) OR (kind = 'desk' AND ? = 'desk'))))`,
    params: [name, kind, listId, input.spaceId === undefined ? row!.space_id : input.spaceId, locationId, input.tillLayout ?? row!.till_layout, active ? 1 : 0, nowMs(), id, listId, locationId, locationId, row!.stock_location_id, locationId, active ? 1 : 0, id, name, kind],
  }).expect(1, OUTLET_REFUSED)
  unit.audit({ action: 'update', record: ['bar.outlet', id] })
}

/** Pins sizes to the front of an outlet's till, in order, replacing what was pinned. A mixer measure is never pinned. */
export function setFavourites(unit: UnitView, outletId: string, variantIds: string[]): void {
  const at = nowMs()
  unit.add({ sql: 'DELETE FROM bar_outlet_favourites WHERE outlet_id = ?', params: [outletId] })
  ;[...new Set(variantIds)].forEach((variantId, position) => {
    unit.add({
      sql: `INSERT INTO bar_outlet_favourites (id, outlet_id, variant_id, position, created_at)
            SELECT ?, ?, v.id, ?, ? FROM bar_variants v WHERE v.id = ? AND v.active = 1 AND v.mixer_measure = 0`,
      params: [newId('bofv'), outletId, position, at, variantId],
    }).expect(1, { code: 'bar.favourite.unknown', reason: 'One of those sizes is not on sale.', remedy: 'Pick sizes that are on sale.' })
  })
  unit.audit({ action: 'update', record: ['bar.outlet', outletId], detail: { favourites: [...new Set(variantIds)] } })
}

export interface RaiseInput { categoryIds?: string[], percent?: number, amountMinor?: number, effectiveFrom?: number }
export interface RaiseRow { variantId: string, oldMinor: number, newMinor: number }

/**
 * A bulk raise on a list priced by hand (BAR-04): every size priced on the list, or only those in the
 * chosen categories, goes up by a percentage (to the nearest minor unit) or a fixed amount. With
 * `unit` null it only works out the old and new prices, for the preview.
 */
export async function raisePrices(unit: UnitView | null, listId: string, input: RaiseInput, by: string): Promise<RaiseRow[]> {
  const list = (await priceLists()).find(l => l.id === listId && l.active)
  if (!list) refuse(GONE('price list').code, GONE('price list').reason, { status: 404 })
  if ((input.percent === undefined) === (input.amountMinor === undefined)) refuse('bar.price.raise-how', 'Raise by a percentage or by an amount.', { status: 422 })
  const variants = await all<{ id: string }>(
    `SELECT v.id FROM bar_variants v JOIN bar_products p ON p.id = v.product_id
      WHERE v.active = 1 AND p.active = 1 AND (? IS NULL OR p.category_id IN (SELECT value FROM json_each(?)))`,
    input.categoryIds?.length ? 1 : null, JSON.stringify(input.categoryIds ?? []),
  )
  const prices = await pricesFor(variants.map(v => v.id), listId)
  const rows = [...prices].map(([variantId, p]) => ({
    variantId,
    oldMinor: p.amountMinor,
    newMinor: input.percent !== undefined ? Math.round(p.amountMinor * (100 + input.percent) / 100) : p.amountMinor + input.amountMinor!, // not-policy: a percentage
  })).filter(r => r.newMinor !== r.oldMinor && r.newMinor >= 0)
  if (unit) for (const r of rows) await setPrice(unit, { variantId: r.variantId, priceListId: list!.standard ? null : listId, amountMinor: r.newMinor, effectiveFrom: input.effectiveFrom }, by)
  return rows
}
