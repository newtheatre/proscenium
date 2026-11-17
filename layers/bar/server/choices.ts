// Choices on a product (Bar specification, tab 10, "Recipes and choices", as approved with the till
// proposal on 17 November): groups set up once and attached to products, options listed by hand or
// (a Mixer group) every product that can be used as a mixer, by its mixer measure. A pick adds its
// amount to the line's unit price, and a restricted pick makes the line need the age check.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { CHOICE_SOURCES, MIXER_PRICING } from './db/schema'

const NAME_TAKEN = (what: string) => ({ code: 'bar.name-taken', reason: `There is already ${what} with that name.`, remedy: 'Choose another name.' })
const GONE = (what: string) => ({ code: 'core.not-found', reason: `There is no such ${what}.` })
export const MIXER_MEASURE = 'Mixer measure'

// ---- Input ---------------------------------------------------------------------------------------

const name = z.string().trim().min(1).max(80) // not-policy: a name's bounds
const id = z.string().min(1).max(64) // not-policy: an id's length
const amount = z.number().int().min(0).max(1_000_000) // not-policy: a bound on a typed price
const MAX_PICKS = 10 // not-policy: more picks than any drink needs

export const groupInput = z.object({
  name,
  source: z.enum(CHOICE_SOURCES),
  required: z.boolean().optional(),
  maxPicks: z.number().int().min(1).max(MAX_PICKS).optional(),
  mixerPricing: z.enum(MIXER_PRICING).nullable().optional(),
  mixerFixedMinor: amount.nullable().optional(),
}).strict()
export const groupPatch = groupInput.omit({ source: true }).partial().extend({ defaultKey: id.nullable().optional(), active: z.boolean().optional() }).strict()
// The stock item a recipe's slot for this group takes when this option is picked; none for "No mixer".
export const optionInput = z.object({ name, deltaMinor: amount.optional(), ageRestricted: z.boolean().optional(), stockItemId: id.nullable().optional() }).strict()
export const optionPatch = optionInput.partial().extend({ active: z.boolean().optional() }).strict()
export const pickInput = z.object({ groupId: id, key: id }).strict()
export type Pick = z.infer<typeof pickInput>

// ---- Groups and options --------------------------------------------------------------------------

type GroupInput = z.infer<typeof groupInput>

function mixerRule(source: string, pricing: string | null | undefined, fixed: number | null | undefined): { pricing: string | null, fixed: number | null } {
  if (source !== 'mixers') return { pricing: null, fixed: null }
  const p = pricing ?? 'included'
  if (p === 'fixed' && (fixed === null || fixed === undefined)) refuse('bar.choice.fixed-amount', 'Say how much a mixer adds.', { status: 422 })
  return { pricing: p, fixed: p === 'fixed' ? fixed! : null }
}

export function addGroup(unit: UnitView, input: GroupInput): string {
  const groupId = newId('bchg')
  const at = nowMs()
  const rule = mixerRule(input.source, input.mixerPricing, input.mixerFixedMinor)
  unit.add({
    sql: `INSERT INTO bar_choice_groups (id, name, source, required, max_picks, default_key, mixer_pricing, mixer_fixed_minor, active, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_choice_groups WHERE lower(name) = lower(?))`,
    params: [groupId, input.name, input.source, input.required === false ? 0 : 1, input.maxPicks ?? 1, rule.pricing, rule.fixed, at, at, input.name],
  }).expect(1, NAME_TAKEN('a choice'))
  unit.audit({ action: 'create', record: ['bar.choice-group', groupId] })
  return groupId
}

export async function updateGroup(unit: UnitView, groupId: string, input: z.infer<typeof groupPatch>): Promise<void> {
  const row = await first<{ name: string, source: string, required: number, max_picks: number, default_key: string | null, mixer_pricing: string | null, mixer_fixed_minor: number | null, active: number }>(
    'SELECT name, source, required, max_picks, default_key, mixer_pricing, mixer_fixed_minor, active FROM bar_choice_groups WHERE id = ?', groupId)
  if (!row) refuse(GONE('choice').code, GONE('choice').reason, { status: 404 })
  const name = input.name ?? row!.name
  const rule = mixerRule(row!.source, input.mixerPricing === undefined ? row!.mixer_pricing : input.mixerPricing, input.mixerFixedMinor === undefined ? row!.mixer_fixed_minor : input.mixerFixedMinor)
  const defaultKey = input.defaultKey === undefined ? row!.default_key : input.defaultKey
  if (defaultKey && !(await optionsOf(groupId, row!.source)).some(o => o.key === defaultKey))
    refuse('bar.choice.bad-default', 'The usual choice must be one of its options.', { status: 422 })
  unit.add({
    sql: `UPDATE bar_choice_groups SET name = ?, required = ?, max_picks = ?, default_key = ?, mixer_pricing = ?, mixer_fixed_minor = ?, active = ?, updated_at = ?
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_choice_groups WHERE lower(name) = lower(?) AND id <> ?)`,
    params: [name, input.required === undefined ? row!.required : input.required ? 1 : 0, input.maxPicks ?? row!.max_picks, defaultKey, rule.pricing, rule.fixed,
      input.active === undefined ? row!.active : input.active ? 1 : 0, nowMs(), groupId, name, groupId],
  }).expect(1, NAME_TAKEN('a choice'))
  unit.audit({ action: 'update', record: ['bar.choice-group', groupId] })
}

export function addOption(unit: UnitView, groupId: string, input: z.infer<typeof optionInput>): string {
  const optionId = newId('bcho')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_choice_options (id, group_id, name, delta_minor, age_restricted, stock_item_id, position, active, created_at, updated_at)
          SELECT ?, id, ?, ?, ?, ?, coalesce((SELECT max(position) + 1 FROM bar_choice_options WHERE group_id = ?), 0), 1, ?, ? FROM bar_choice_groups
           WHERE id = ? AND source = 'options' AND NOT EXISTS (SELECT 1 FROM bar_choice_options WHERE group_id = ? AND lower(name) = lower(?))
           AND (? IS NULL OR EXISTS (SELECT 1 FROM bar_stock_items WHERE id = ? AND active = 1))`,
    params: [optionId, input.name, input.deltaMinor ?? 0, input.ageRestricted ? 1 : 0, input.stockItemId ?? null, groupId, at, at, groupId, groupId, input.name, input.stockItemId ?? null, input.stockItemId ?? null],
  }).expect(1, { code: 'bar.choice.option-not-added', reason: 'That option could not be added: the name is in use, the choice takes its options from the mixers, or the stock item is not in use.', remedy: 'Choose another name or stock item.' })
  unit.audit({ action: 'update', record: ['bar.choice-group', groupId], detail: { optionAdded: optionId } })
  return optionId
}

export async function updateOption(unit: UnitView, optionId: string, input: z.infer<typeof optionPatch>): Promise<void> {
  const row = await first<{ group_id: string, name: string, delta_minor: number, age_restricted: number, stock_item_id: string | null, active: number }>('SELECT group_id, name, delta_minor, age_restricted, stock_item_id, active FROM bar_choice_options WHERE id = ?', optionId)
  if (!row) refuse(GONE('option').code, GONE('option').reason, { status: 404 })
  const name = input.name ?? row!.name
  const itemId = input.stockItemId === undefined ? row!.stock_item_id : input.stockItemId
  if (itemId && itemId !== row!.stock_item_id && !await first('SELECT 1 FROM bar_stock_items WHERE id = ? AND active = 1', itemId))
    refuse('bar.stock-item.unknown', 'That stock item is not in use.', { status: 422 })
  unit.add({
    sql: `UPDATE bar_choice_options SET name = ?, delta_minor = ?, age_restricted = ?, stock_item_id = ?, active = ?, updated_at = ?
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_choice_options WHERE group_id = ? AND lower(name) = lower(?) AND id <> ?)`,
    params: [name, input.deltaMinor ?? row!.delta_minor, input.ageRestricted === undefined ? row!.age_restricted : input.ageRestricted ? 1 : 0, itemId,
      input.active === undefined ? row!.active : input.active ? 1 : 0, nowMs(), optionId, row!.group_id, name, optionId],
  }).expect(1, NAME_TAKEN('an option'))
  unit.audit({ action: 'update', record: ['bar.choice-group', row!.group_id], detail: { optionChanged: optionId } })
}

/** The groups a product asks, in order. Replaces what was attached. */
export function setProductGroups(unit: UnitView, productId: string, groupIds: string[]): void {
  const at = nowMs()
  unit.add({ sql: 'DELETE FROM bar_product_choice_groups WHERE product_id = ?', params: [productId] })
  groupIds.forEach((groupId, position) => {
    unit.add({
      sql: 'INSERT INTO bar_product_choice_groups (id, product_id, group_id, position, created_at) SELECT ?, ?, id, ?, ? FROM bar_choice_groups WHERE id = ?',
      params: [newId('bpcg'), productId, position, at, groupId],
    }).expect(1, { code: 'bar.choice.unknown', reason: 'One of those choices does not exist.' })
  })
  unit.audit({ action: 'update', record: ['bar.product', productId], detail: { choices: groupIds } })
}

/**
 * "Can be used as a mixer": gives the product a hidden size, its mixer measure, which every Mixer
 * group offers; or retires it. The measure is priced like any size, for groups that charge a mixer at
 * its own price.
 */
export async function setMixer(unit: UnitView, productId: string, on: boolean): Promise<void> {
  const at = nowMs()
  const existing = await first<{ id: string }>('SELECT id FROM bar_variants WHERE product_id = ? AND mixer_measure = 1', productId)
  if (existing) {
    unit.add({ sql: 'UPDATE bar_variants SET active = ?, updated_at = ? WHERE id = ?', params: [on ? 1 : 0, at, existing.id] })
  }
  else if (on) {
    unit.add({
      sql: `INSERT INTO bar_variants (id, product_id, name, mixer_measure, position, active, created_at, updated_at)
            SELECT ?, id, ?, 1, 999, 1, ?, ? FROM bar_products WHERE id = ?`, // not-policy: the hidden measure sorts after every size
      params: [newId('bvar'), MIXER_MEASURE, at, at, productId],
    }).expect(1, { code: GONE('product').code, reason: GONE('product').reason })
  }
  unit.audit({ action: 'update', record: ['bar.product', productId], detail: { mixer: on } })
}

// ---- Reading -------------------------------------------------------------------------------------

export interface ChoiceOption { key: string, label: string, deltaMinor: number, ageRestricted: boolean, optionId: string | null, mixerVariantId: string | null }
export interface ChoiceGroup { id: string, name: string, source: 'options' | 'mixers', required: boolean, maxPicks: number, defaultKey: string | null, mixerPricing: 'included' | 'fixed' | 'own_price' | null, mixerFixedMinor: number | null, active: boolean, options: ChoiceOption[] }

/**
 * A group's options as the till offers them. A Mixer group's are every active mixer measure, keyed by
 * the measure's variant id; their amount is filled in by `priceGroups`, which knows the price list.
 */
async function optionsOf(groupId: string, source: string): Promise<ChoiceOption[]> {
  if (source === 'mixers') {
    const rows = await all<{ id: string, product: string, age_restricted: number }>(
      `SELECT v.id, p.name AS product, (CASE WHEN p.age_from_category = 1 THEN c.age_restricted ELSE p.age_restricted END) AS age_restricted FROM bar_variants v JOIN bar_products p ON p.id = v.product_id JOIN bar_categories c ON c.id = p.category_id
        WHERE v.mixer_measure = 1 AND v.active = 1 AND p.active = 1 AND c.active = 1 ORDER BY c.position, p.position, lower(p.name), v.id`)
    return rows.map(r => ({ key: r.id, label: r.product, deltaMinor: 0, ageRestricted: !!r.age_restricted, optionId: null, mixerVariantId: r.id }))
  }
  const rows = await all<{ id: string, name: string, delta_minor: number, age_restricted: number }>(
    'SELECT id, name, delta_minor, age_restricted FROM bar_choice_options WHERE group_id = ? AND active = 1 ORDER BY position, id', groupId)
  return rows.map(r => ({ key: r.id, label: r.name, deltaMinor: r.delta_minor, ageRestricted: !!r.age_restricted, optionId: r.id, mixerVariantId: null }))
}

interface GroupRow { id: string, name: string, source: 'options' | 'mixers', required: number, max_picks: number, default_key: string | null, mixer_pricing: ChoiceGroup['mixerPricing'], mixer_fixed_minor: number | null, active: number }

/** Every group with its options (hand-listed ones whatever their state, for the set-up screen). */
export async function choiceGroups(options: { activeOnly?: boolean } = {}): Promise<ChoiceGroup[]> {
  const rows = await all<GroupRow>(`SELECT id, name, source, required, max_picks, default_key, mixer_pricing, mixer_fixed_minor, active FROM bar_choice_groups ${options.activeOnly ? 'WHERE active = 1' : ''} ORDER BY lower(name), id`)
  return await Promise.all(rows.map(async r => ({
    id: r.id, name: r.name, source: r.source, required: !!r.required, maxPicks: r.max_picks, defaultKey: r.default_key,
    mixerPricing: r.mixer_pricing, mixerFixedMinor: r.mixer_fixed_minor, active: !!r.active,
    options: await optionsOf(r.id, r.source),
  })))
}

/** The groups attached to each product, in order. */
export async function groupsByProduct(productIds?: string[]): Promise<Map<string, string[]>> {
  const rows = await all<{ product_id: string, group_id: string }>(
    `SELECT a.product_id, a.group_id FROM bar_product_choice_groups a JOIN bar_choice_groups g ON g.id = a.group_id
      WHERE g.active = 1 ${productIds ? 'AND a.product_id IN (SELECT value FROM json_each(?))' : ''} ORDER BY a.product_id, a.position, a.id`,
    ...(productIds ? [JSON.stringify(productIds)] : []))
  const out = new Map<string, string[]>()
  for (const r of rows) out.set(r.product_id, [...out.get(r.product_id) ?? [], r.group_id])
  return out
}

/**
 * Puts each option's amount on, for one price list: a hand-listed option adds its own amount; a mixer
 * adds nothing, the group's fixed amount, or its measure's price (`priceOf`, on the list in use).
 * A mixer with no price under "own price" is left out.
 */
export function priceGroups(groups: ChoiceGroup[], priceOf: (variantId: string) => number | null): ChoiceGroup[] {
  return groups.map((g) => {
    if (g.source !== 'mixers') return g
    const options = g.options.flatMap((o) => {
      if (g.mixerPricing === 'fixed') return [{ ...o, deltaMinor: g.mixerFixedMinor ?? 0 }]
      if (g.mixerPricing === 'own_price') {
        const amount = priceOf(o.key)
        return amount === null ? [] : [{ ...o, deltaMinor: amount }]
      }
      return [{ ...o, deltaMinor: 0 }]
    })
    return { ...g, options }
  })
}

export interface Picked { groupId: string, optionId: string | null, mixerVariantId: string | null, label: string, deltaMinor: number, ageRestricted: boolean }

/**
 * The picks on one line, checked against the product's groups: every pick is one of an attached
 * group's options, a group gets no more than its picks, and a required group with no pick takes its
 * usual choice or is refused. Returned in the product's order of groups.
 */
export function resolvePicks(label: string, attached: string[], groups: Map<string, ChoiceGroup>, picks: Pick[]): Picked[] {
  const out: Picked[] = []
  for (const groupId of attached) {
    const group = groups.get(groupId)
    if (!group) continue
    let mine = picks.filter(p => p.groupId === groupId)
    if (!mine.length && group.required) {
      if (!group.defaultKey) refuse('bar.choice.missing', `${label} needs a choice of ${group.name.toLowerCase()}.`, { status: 409, remedy: 'Make the choice and try again.' })
      mine = [{ groupId, key: group.defaultKey! }]
    }
    if (mine.length > group.maxPicks) refuse('bar.choice.too-many', `${label} takes at most ${group.maxPicks} of ${group.name.toLowerCase()}.`, { status: 409 })
    if (new Set(mine.map(p => p.key)).size !== mine.length) refuse('bar.choice.repeated', 'The same choice was picked twice.', { status: 409 })
    for (const p of mine) {
      const option = group.options.find(o => o.key === p.key)
      if (!option) refuse('bar.choice.gone', `A choice on ${label} is no longer offered.`, { status: 409, remedy: 'Choose again.' })
      out.push({ groupId, optionId: option!.optionId, mixerVariantId: option!.mixerVariantId, label: option!.label, deltaMinor: option!.deltaMinor, ageRestricted: option!.ageRestricted })
    }
  }
  if (picks.some(p => !attached.includes(p.groupId))) refuse('bar.choice.not-here', `${label} does not take that choice.`, { status: 409, remedy: 'Choose again.' })
  return out
}
