// Product presets and the two-step Add a product window (Bar specification, tab 10, approved 17
// November). A preset holds what a kind of product usually has: its sizes with their measures, the
// choices it asks, whether it is a mixer, and an age check override. Never a name, a price or stock.
// Built-in presets live in code; the theatre's own are saved from the window.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { addProduct, addVariant } from './catalogue'
import { setMixer, setProductGroups } from './choices'

export interface PresetSize { name: string, measure: string | null }
export interface Preset {
  id: string
  builtIn: boolean
  // A built-in's name and description are translations (bar.presets.<key>.name), so null here.
  name: string | null
  sizes: PresetSize[]
  // Built-ins name the choices they usually ask; the window attaches groups with those names, if any.
  groupIds: string[]
  groupNames: string[]
  ageRestricted: boolean | null
  mixer: boolean
}

const size = (name: string, measure: string | null = null): PresetSize => ({ name, measure })
const builtIn = (key: string, sizes: PresetSize[], extra: Partial<Preset> = {}): Preset =>
  ({ id: `builtin:${key}`, builtIn: true, name: null, sizes, groupIds: [], groupNames: [], ageRestricted: null, mixer: false, ...extra })

export const BUILT_IN_PRESETS: Preset[] = [
  builtIn('can', [size('Each', '1 can or bottle')]),
  builtIn('draught', [size('Pint', '568 ml'), size('Half', '284 ml')]),
  builtIn('wine', [size('125ml', '125 ml'), size('175ml', '175 ml'), size('250ml', '250 ml'), size('Bottle', '750 ml')]),
  builtIn('spirit', [size('Single', '25 ml'), size('Double', '50 ml')], { groupNames: ['Spirit', 'Mixer'] }),
  builtIn('jug', [size('Jug')]),
  builtIn('hot', [size('Each', '1 serving')], { groupNames: ['Milk'] }),
  builtIn('snack', [size('Each', '1 pack')]),
  builtIn('merch', [size('Each', '1 item')]),
  builtIn('blank', [size('Each')]),
]

const MAX_SIZES = 8 // not-policy: more sizes than any drink has, inside a unit's statement cap
const MAX_GROUPS = 10 // not-policy: more choices than any drink asks
const id = z.string().min(1).max(64) // not-policy: an id's length
const name = z.string().trim().min(1).max(80) // not-policy: a name's bounds
const sizeInput = z.object({ name, measure: z.string().trim().max(40).nullable().optional() }).strict() // not-policy: a measure's bound
const amount = z.number().int().min(0).max(1_000_000) // not-policy: a bound on a typed price

export const presetInput = z.object({
  name,
  sizes: z.array(sizeInput).min(1).max(MAX_SIZES),
  groupIds: z.array(id).max(MAX_GROUPS).default([]),
  ageRestricted: z.boolean().nullable().default(null),
  mixer: z.boolean().default(false),
}).strict()
export type PresetInput = z.infer<typeof presetInput>

/** What Add a product sends: the product, one row per size with its Standard price, and its choices. */
export const setupInput = z.object({
  categoryId: id,
  name,
  ageRestricted: z.boolean().nullable().default(null),
  sizes: z.array(z.object({ name, amountMinor: amount.nullable().optional() }).strict()).min(1).max(MAX_SIZES),
  groupIds: z.array(id).max(MAX_GROUPS).default([]),
  mixer: z.boolean().default(false),
}).strict()
  .refine(v => new Set(v.sizes.map(s => s.name.toLowerCase())).size === v.sizes.length, { message: 'Each size needs its own name.', path: ['sizes'] })
export type SetupInput = z.infer<typeof setupInput>

/** The built-ins, then the theatre's own in use, by name. */
export async function presets(): Promise<Preset[]> {
  const rows = await all<{ id: string, name: string, sizes: string, group_ids: string, age_restricted: number | null, mixer: number }>(
    'SELECT id, name, sizes, group_ids, age_restricted, mixer FROM bar_product_presets WHERE active = 1 ORDER BY lower(name), id',
  )
  return [
    ...BUILT_IN_PRESETS,
    ...rows.map(r => ({
      id: r.id, builtIn: false, name: r.name, sizes: JSON.parse(r.sizes) as PresetSize[], groupIds: JSON.parse(r.group_ids) as string[],
      groupNames: [], ageRestricted: r.age_restricted === null ? null : !!r.age_restricted, mixer: !!r.mixer,
    })),
  ]
}

/** Refuses a category's usual preset that names nothing in use. */
export async function checkUsualPreset(ref: string | null | undefined): Promise<void> {
  if (!ref) return
  const found = ref.startsWith('builtin:') ? BUILT_IN_PRESETS.some(p => p.id === ref) : !!await first('SELECT 1 FROM bar_product_presets WHERE id = ? AND active = 1', ref)
  if (!found) refuse('bar.preset.unknown', 'That preset does not exist.', { status: 422 })
}

export function addPreset(unit: UnitView, input: PresetInput, by: string): string {
  const presetId = newId('bpps')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_product_presets (id, name, sizes, group_ids, age_restricted, mixer, active, created_by, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_product_presets WHERE active = 1 AND lower(name) = lower(?))`,
    params: [
      presetId, input.name, JSON.stringify(input.sizes.map(s => ({ name: s.name, measure: s.measure ?? null }))), JSON.stringify(input.groupIds),
      input.ageRestricted === null ? null : input.ageRestricted ? 1 : 0, input.mixer ? 1 : 0, by, at, at, input.name,
    ],
  }).expect(1, { code: 'bar.preset.name-taken', reason: 'Another preset has that name.', remedy: 'Pick another name.' })
  unit.audit({ action: 'create', record: ['bar.product-preset', presetId] })
  return presetId
}

/** Retires one of the theatre's presets; a category that used it as its usual preset goes back to none. */
export async function retirePreset(unit: UnitView, presetId: string): Promise<void> {
  if (!await first('SELECT 1 FROM bar_product_presets WHERE id = ?', presetId)) refuse('bar.preset.unknown', 'That preset does not exist.', { status: 404 })
  const at = nowMs()
  unit.add({ sql: 'UPDATE bar_product_presets SET active = 0, updated_at = ? WHERE id = ?', params: [at, presetId] })
  unit.add({ sql: 'UPDATE bar_categories SET usual_preset = NULL, updated_at = ? WHERE usual_preset = ?', params: [at, presetId] })
  unit.audit({ action: 'update', record: ['bar.product-preset', presetId], detail: { active: false } })
}

/**
 * Adds a product from the window in one go: the product and every size with its Standard price, its
 * choices in order, and its mixer measure when ticked.
 */
export async function setupProduct(unit: UnitView, input: SetupInput, by: string): Promise<{ productId: string }> {
  const [firstSize, ...rest] = input.sizes
  const { productId } = await addProduct(unit, { categoryId: input.categoryId, name: input.name, ageRestricted: input.ageRestricted }, { name: firstSize!.name, amountMinor: firstSize!.amountMinor }, by)
  for (const s of rest) await addVariant(unit, productId, { name: s.name }, s.amountMinor, by)
  if (input.groupIds.length) setProductGroups(unit, productId, [...new Set(input.groupIds)])
  if (input.mixer) await setMixer(unit, productId, true)
  return { productId }
}
